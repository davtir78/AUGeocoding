
const XLSX = require('xlsx');
const path = require('path');

const workbookPath = path.resolve(__dirname, '../../../Docs/ProjectPlan/curriculum-workbook.xlsx');

try {
    const workbook = XLSX.readFile(workbookPath);
    const sheetName = 'Learning areas'; // Sheet 1
    console.log(`Analyzing Sheet: ${sheetName}`);

    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
        console.log('Sheet not found!');
    } else {
        // Get first 5 rows
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, limit: 5 });
        rows.forEach((row, i) => {
            console.log(`Row ${i}:`, JSON.stringify(row));
        });
    }

} catch (error) {
    console.error("Error reading file:", error);
}
