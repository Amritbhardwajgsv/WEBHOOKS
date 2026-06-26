const getaccesstoken = require('./getaccesstoken');

function extractFields(outputArray) {
    const text = Array.isArray(outputArray) ? outputArray.join('\n') : outputArray || '';
    const match = (regex) => (text.match(regex) || [])[1]?.trim() || '';

    const tenderNo    = match(/Tender No[.:\s]+([A-Z0-9_]+)/i);
    const dueDate     = match(/Tender Closing Date Time\s+(\d{2}\/\d{2}\/\d{4})/i)
                     || match(/Closing Date(?:\/Time)?[:\s]+(\d{2}\/\d{2}\/\d{4})/i);
    const status      = match(/Tender Type\s+([^\n]+)/i);
    const rawValue    = match(/Advertised Value\s+([\d.]+)/i);
    const valueInCr   = rawValue ? (parseFloat(rawValue) / 10000000).toFixed(2) + ' Cr' : '';
    const nameOfWork  = match(/Name of Work\s+([^\n]{10,})/i);
    const authority   = match(/Designation\s*:\s*([^\n]+)/i);
    const authorityName = match(/Signed By[:\s]+([^\n]+)/i);

    return { tenderNo, dueDate, status, valueInCr, nameOfWork, authority, authorityName };
}

async function appendExcelRow({ objectKey, entityId, fileName, parsed }) {
    const driveId   = process.env.EXCEL_DRIVE_ID;
    const itemId    = process.env.EXCEL_ITEM_ID;
    const tableName = process.env.EXCEL_TABLE_NAME || 'Table1';

    if (!driveId || !itemId) {
        console.warn('Excel env vars not set, skipping append');
        return;
    }

    const token = await getaccesstoken();
    const { tenderNo, dueDate, status, valueInCr, nameOfWork, authority, authorityName } = extractFields(parsed.output);

    // Columns: Sales Territory Name | ID | Tender No. | Due Date | Qty | Status |
    //          Publish to Forecast | Name | Category | Application | Value |
    //          Authority | Authority Name | Status | Random | Work
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

    const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${encodeURIComponent(itemId)}/workbook/tables/${tableName}/rows/add`;

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ values: [row] }),
    });

    if (!res.ok) throw new Error(`Graph API error ${res.status}: ${await res.text()}`);
    console.log('excel row appended for:', fileName);
}

module.exports = { appendExcelRow };
