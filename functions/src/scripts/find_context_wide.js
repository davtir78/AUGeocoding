
const XLSX = require('xlsx');
const path = require('path');

const workbookPath = path.resolve(__dirname, '../../../Docs/ProjectPlan/curriculum-workbook.xlsx');

try {
    const workbook = XLSX.readFile(workbookPath);
    const sheet = workbook.Sheets['Learning areas'];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    let targetIndex = -1;
    rows.forEach((row, i) => {
        if (row[4] === "AC9M5M01") targetIndex = i;
    });

    if (targetIndex !== -1) {
        const start = Math.max(0, targetIndex - 20); // Just 20 is enough if headers are close
        for (let i = start; i <= targetIndex; i++) {
            // truncate long strings
            const row = rows[i].map(c => (typeof c === 'string' && c.length > 20) ? c.substring(0, 20) + '...' : c);
            console.log(`Row ${i}:`, JSON.stringify(row));
        }
    }

} catch (error) { console.error(error); }
