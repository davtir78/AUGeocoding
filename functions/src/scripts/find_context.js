
const XLSX = require('xlsx');
const path = require('path');

const workbookPath = path.resolve(__dirname, '../../../Docs/ProjectPlan/curriculum-workbook.xlsx');

try {
    const workbook = XLSX.readFile(workbookPath);
    const sheet = workbook.Sheets['Learning areas'];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    console.log("Searching for context around AC9M5M01...");

    let targetIndex = -1;
    rows.forEach((row, i) => {
        if (JSON.stringify(row).includes("AC9M5M01") && targetIndex === -1) {
            targetIndex = i;
        }
    });

    if (targetIndex !== -1) {
        // Print 20 rows before and 5 after
        const start = Math.max(0, targetIndex - 20);
        const end = Math.min(rows.length, targetIndex + 5);

        for (let i = start; i < end; i++) {
            console.log(`Row ${i}:`, JSON.stringify(rows[i]));
        }
    }

} catch (error) {
    console.error("Error:", error);
}
