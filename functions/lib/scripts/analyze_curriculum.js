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
const path = __importStar(require("path"));
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
}
catch (error) {
    console.error("Error reading file:", error);
}
