const { google } = require('googleapis');

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

function extractFields(outputArray) {
    const text = Array.isArray(outputArray) ? outputArray.join('\n') : outputArray || '';
    const match = (regex) => (text.match(regex) || [])[1]?.trim() || '';

    const tenderNo      = match(/Tender No[.:\s]+([A-Z0-9_]+)/i);
    const dueDate       = match(/Tender Closing Date Time\s+(\d{2}\/\d{2}\/\d{4})/i)
                       || match(/Closing Date(?:\/Time)?[:\s]+(\d{2}\/\d{2}\/\d{4})/i);
    const status        = match(/Tender Type\s+([^\n]+)/i);
    const rawValue      = match(/Advertised Value\s+([\d.]+)/i);
    const valueInCr     = rawValue ? (parseFloat(rawValue) / 10000000).toFixed(2) + ' Cr' : '';
    const nameOfWork    = match(/Name of Work\s+([^\n]{10,})/i);
    const authority     = match(/Designation\s*:\s*([^\n]+)/i);
    const authorityName = match(/Signed By[:\s]+([^\n]+)/i);

    return { tenderNo, dueDate, status, valueInCr, nameOfWork, authority, authorityName };
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

    const { tenderNo, dueDate, status, valueInCr, nameOfWork, authority, authorityName } = extractFields(parsed.output);

    // Order matches columns: Sales Territory Name | ID | Tender No. | Due Date | Qty |
    // Status | Publish to Forecast | Name | Category | Application | Value |
    // Authority | Authority Name | Status | Random | Work
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
        '',             // Random
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
