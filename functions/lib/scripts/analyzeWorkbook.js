"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const XLSX = __importStar(require("xlsx"));
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
            const headers = data[0];
            console.log('Headers:', headers);
            if (data.length > 1) {
                const sampleRow = data[1];
                const sampleObj = {};
                headers.forEach((h, i) => {
                    let val = sampleRow[i];
                    if (typeof val === 'string' && val.length > 50)
                        val = val.substring(0, 50) + '...';
                    sampleObj[h] = val;
                });
                console.log('Sample Row 1 (mapped):', JSON.stringify(sampleObj, null, 2));
            }
        }
        else {
            console.log('Sheet is empty.');
        }
    });
}
catch (error) {
    console.error('Error reading workbook:', error);
}
