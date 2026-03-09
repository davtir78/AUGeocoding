
const XLSX = require('xlsx');
const path = require('path');

const workbookPath = path.resolve(__dirname, '../../../Docs/ProjectPlan/curriculum-workbook.xlsx');

try {
    const workbook = XLSX.readFile(workbookPath);
    const sheet = workbook.Sheets['Learning areas'];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    console.log("Searching for AC9M5M01...");

    rows.forEach((row, i) => {
        // Check all columns for the code
        const strRow = JSON.stringify(row);
        if (strRow.includes("AC9M5M01")) {
            console.log(`Row ${i}:`, strRow);
        }
    });

} catch (error) {
    console.error("Error:", error);
}
