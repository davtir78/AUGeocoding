
const XLSX = require('xlsx');
const path = require('path');

const workbookPath = path.resolve(__dirname, '../../../Docs/ProjectPlan/curriculum-workbook.xlsx');

try {
    const workbook = XLSX.readFile(workbookPath);
    const sheet = workbook.Sheets['Learning areas'];

    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    console.log("Searching for Mathematics rows...");

    // Find first 5 rows containing "Mathematics" in first column
    let count = 0;
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (row[0] === 'Mathematics') {
            console.log(`Row ${i}:`, JSON.stringify(row));
            count++;
            if (count >= 5) break;
        }
    }

} catch (error) {
    console.error("Error:", error);
}
