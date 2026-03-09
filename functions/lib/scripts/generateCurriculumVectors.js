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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const XLSX = __importStar(require("xlsx"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const node_fetch_1 = __importDefault(require("node-fetch"));
const p_map_1 = __importDefault(require("p-map"));
const WORKBOOK_PATH = path.resolve(__dirname, '../../../Docs/ProjectPlan/curriculum-workbook.xlsx');
const SHEET_NAME = 'Learning areas';
const OUTPUT_PATH = path.resolve(__dirname, '../data/curriculum-vectors.json');
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
async function getEmbedding(text) {
    const response = await (0, node_fetch_1.default)('https://openrouter.ai/api/v1/embeddings', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://scholars-alley.com',
            'X-Title': 'Scholars Alley'
        },
        body: JSON.stringify({
            model: 'openai/text-embedding-3-small',
            input: text
        })
    });
    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Embedding API failed: ${response.status} ${err}`);
    }
    const data = await response.json();
    return data.data[0].embedding;
}
async function run() {
    if (!OPENROUTER_API_KEY) {
        console.error('OPENROUTER_API_KEY not set.');
        process.exit(1);
    }
    console.log('📖 Reading Workbook...');
    const workbook = XLSX.readFile(WORKBOOK_PATH);
    const sheet = workbook.Sheets[SHEET_NAME];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    const standards = [];
    let currentStrand = '';
    console.log('🔍 Processing Rows...');
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0)
            continue;
        const col7 = row[7];
        if (col7 && typeof col7 === 'string' && col7.length < 100) {
            currentStrand = col7;
        }
        const codeCandidate = row.find((cell) => typeof cell === 'string' && /^AC9M[A-Z0-9_]+$/.test(cell));
        if (!codeCandidate || codeCandidate.includes('_E'))
            continue;
        const subject = row[1] || row[0] || 'Mathematics';
        const yearLevel = row[2] || '';
        const description = row.find((cell) => typeof cell === 'string' && cell.length > 20 && cell !== subject && cell !== yearLevel) || '';
        if (!description)
            continue;
        standards.push({
            id: codeCandidate,
            subject,
            year: yearLevel,
            strand: currentStrand,
            desc: description,
            textToEmbed: `${subject} Year ${yearLevel} ${currentStrand}: ${description}`
        });
    }
    console.log(`✨ Generating Embeddings for ${standards.length} standards (using p-map)...`);
    // Process in parallel with concurrency limit
    const vectors = await (0, p_map_1.default)(standards, async (std, index) => {
        try {
            if (index % 10 === 0)
                console.log(`   Progress: ${index}/${standards.length}`);
            const embedding = await getEmbedding(std.textToEmbed);
            return {
                id: std.id,
                desc: std.desc,
                strand: std.strand,
                embedding
            };
        }
        catch (e) {
            console.error(`❌ Failed standard ${std.id}: ${e.message}`);
            return null;
        }
    }, { concurrency: 5 });
    const finalVectors = vectors.filter(v => v !== null);
    console.log(`💾 Saving ${finalVectors.length} vectors to ${OUTPUT_PATH}...`);
    const dataDir = path.dirname(OUTPUT_PATH);
    if (!fs.existsSync(dataDir))
        fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(finalVectors, null, 2));
    console.log('✅ Done!');
}
run().catch(console.error);
