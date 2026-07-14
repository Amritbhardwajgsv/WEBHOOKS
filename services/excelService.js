const { google } = require('googleapis');
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function getAuthClient() {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    console.log('sheets auth → client_email:', credentials.client_email);
    const auth = new google.auth.JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    await auth.authorize();
    return auth;
}

function extractFieldsRegex(outputArray) {
    const text = Array.isArray(outputArray) ? outputArray.join('\n') : outputArray || '';
    const match = (regex) => (text.match(regex) || [])[1]?.trim() || '';

    const tenderNo      = match(/Tender No[.:\s]+([A-Z0-9_]+)/i);
    const dueDate       = match(/Tender Closing Date Time\s+(\d{2}\/\d{2}\/\d{4})/i)
                       || match(/Closing Date(?:\/Time)?[:\s]+(\d{2}\/\d{2}\/\d{4})/i);
    const status        = match(/Tender Type\s+(\w+)/i);
    const rawValue      = match(/Advertised Value\s+([\d.]+)/i);
    const valueInCr     = rawValue ? (parseFloat(rawValue) / 10000000).toFixed(2) + ' Cr' : '';
    const nameOfWork    = match(/Name of Work\s+([\s\S]+?)(?=\.?\s*Bidding\s+type)/i)
                       || match(/Description\s*:\s*([^\n\]]+)/i);
    const authority     = match(/Designation\s*:\s*([^\n]+)/i);
    const authorityName = match(/Signed By[:\s]+([^\n]+)/i);

    return { tenderNo, dueDate, status, valueInCr, nameOfWork, authority, authorityName };
}

async function extractFieldsLLM(outputArray) {
    const text = Array.isArray(outputArray) ? outputArray.join('\n') : outputArray || '';
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

    const beginning = text.slice(0, 6000);
    const ending = text.length > 6000 ? text.slice(-2000) : '';
    const docText = ending ? beginning + '\n\n[...]\n\n' + ending : beginning;

    const prompt = `Extract fields from this Indian Railway tender document. Return ONLY a valid JSON object, no extra text.

Fields to extract:
- tenderNo: the tender number (e.g. "L1265227", "82262908B")
- dueDate: closing/due date in DD/MM/YYYY format only (e.g. "27/06/2026")
- status: FIRST WORD ONLY of the Tender Type field (e.g. if "Open - Indigenous" return "Open", if "Limited - Indigenous" return "Limited")
- valueInCr: the Advertised Value field converted to crores with 2 decimal places and " Cr" suffix (e.g. "12.50 Cr"). If no Advertised Value field exists, return empty string. Do NOT use Earnest Money or Tender Doc Cost.
- nameOfWork: name of work for works tenders, or the item/product description (Tender Title) for goods/stores tenders
- authority: the designation/role code from the "Digitally Signed By" section (e.g. "AMM/DSD/UBL", "Sr.DSTE/S/BCT") — NOT the person's name
- authorityName: the person's actual name from inside the parentheses in the "Digitally Signed By" section (e.g. from "AMM/DSD/UBL ( DHANANJAY KUMAR )" extract "DHANANJAY KUMAR")

Document:
${docText}

Return JSON only:`;

    const result = await model.generateContent(prompt);
    const raw = result.response.text();
    console.log('gemini raw response:', raw.slice(0, 300));
    const jsonMatch = raw.match(/\{[\s\S]+\}/);
    if (!jsonMatch) throw new Error('No JSON found in Gemini response');
    return JSON.parse(jsonMatch[0]);
}

async function appendExcelRow({ objectKey, entityId, fileName, parsed }) {
    const sheetId   = process.env.GOOGLE_SHEET_ID;
    const sheetName = process.env.GOOGLE_SHEET_NAME || 'Sheet2';

    if (!sheetId) {
        console.warn('GOOGLE_SHEET_ID not set, skipping append');
        return;
    }

    const auth = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });
    console.log('sheets append → sheetId:', sheetId, 'sheetName:', sheetName);
    try {
        const info = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
        console.log('spreadsheet title:', info.data.properties?.title);
        console.log('sheet tabs:', info.data.sheets.map(s => s.properties.title));
    } catch (e) {
        console.log('spreadsheets.get failed:', e.message);
    }

    let fields;
    if (process.env.GEMINI_API_KEY) {
        try {
            fields = await extractFieldsLLM(parsed.output);
            console.log('gemini extracted fields:', JSON.stringify(fields));
        } catch (err) {
            console.warn('gemini extraction failed, falling back to regex:', err.message);
            fields = extractFieldsRegex(parsed.output);
        }
    } else {
        console.log('GEMINI_API_KEY not set, using regex extraction');
        fields = extractFieldsRegex(parsed.output);
    }

    const { tenderNo, dueDate, status, valueInCr, nameOfWork, authority, authorityName } = fields;

    const row = [
        '',             // Sales Territory Name
        '',             // ID
        tenderNo,       // Tender No.
        dueDate,        // Due Date
        '',             // Qty
        status,         // Status
        '',             // Publish to Forecast
        '',             // Name
        '',             // Category
        '',             // Application
        valueInCr,      // Value
        authority,      // Authority
        authorityName,  // Authority Name
        '',             // Status (2nd)
        nameOfWork,     // Work
    ];

    await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: `${sheetName}!A:P`,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [row] },
    });

    console.log('google sheet row appended for:', fileName);
}

module.exports = { appendExcelRow };
