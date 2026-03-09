
import * as XLSX from 'xlsx';
import * as path from 'path';

const workbookPath = path.resolve(__dirname, '../../../Docs/ProjectPlan/curriculum-workbook.xlsx');

console.log(`Reading workbook from: ${workbookPath}`);

try {
    const workbook = XLSX.readFile(workbookPath);
    const sheetNames = workbook.SheetNames;

    console.log('--- Sheet Names ---');
    sheetNames.forEach((name, index) => {
        console.log(`${index + 1}. ${name}`);
    });

    console.log('\n--- Sample Data (First 3 rows) ---');
    sheetNames.forEach(name => {
        console.log(`\n[Sheet: ${name}]`);
        const sheet = workbook.Sheets[name];
        // Get JSON with header option to see column names if possible, or just raw
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        rows.forEach((row, i) => {
            console.log(`Row ${i}:`, JSON.stringify(row));
        });
    });

} catch (error) {
    console.error("Error reading file:", error);
}
