
import * as XLSX from 'xlsx';
import * as path from 'path';

const workbookPath = "c:\\Users\\davti\\OneDrive\\Documents\\Tech\\Code\\scholars-alley\\Docs\\ProjectPlan\\curriculum-workbook.xlsx";

try {
    console.log(`Reading workbook from: ${workbookPath}`);
    const workbook = XLSX.readFile(workbookPath);

    console.log(`\nWorkbook Sheets: ${workbook.SheetNames.join(', ')}`);

    workbook.SheetNames.forEach(sheetName => {
        console.log(`\n--- Sheet: ${sheetName} ---`);
        const sheet = workbook.Sheets[sheetName];

        // Convert to JSON to see structure
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }); // Header: 1 gives array of arrays

        if (data.length > 0) {
            console.log(`Row Count: ${data.length}`);
            const headers = data[0] as string[];
            console.log('Headers:', headers);

            if (data.length > 1) {
                const sampleRow = data[1] as any[];
                const sampleObj: any = {};
                headers.forEach((h, i) => {
                    let val = sampleRow[i];
                    if (typeof val === 'string' && val.length > 50) val = val.substring(0, 50) + '...';
                    sampleObj[h] = val;
                });
                console.log('Sample Row 1 (mapped):', JSON.stringify(sampleObj, null, 2));
            }
        } else {
            console.log('Sheet is empty.');
        }
    });

} catch (error) {
    console.error('Error reading workbook:', error);
}
