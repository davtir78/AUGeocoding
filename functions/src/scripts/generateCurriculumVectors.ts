import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';
import fetch from 'node-fetch';
import pMap from 'p-map';

const WORKBOOK_PATH = path.resolve(__dirname, '../../../Docs/ProjectPlan/curriculum-workbook.xlsx');
const SHEET_NAME = 'Learning areas';
const OUTPUT_PATH = path.resolve(__dirname, '../data/curriculum-vectors.json');
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

async function getEmbedding(text: string): Promise<number[]> {
    const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
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

    const data: any = await response.json();
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
    const rows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    const standards: any[] = [];
    let currentStrand = '';

    console.log('🔍 Processing Rows...');
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        const col7 = row[7];
        if (col7 && typeof col7 === 'string' && col7.length < 100) {
            currentStrand = col7;
        }

        const codeCandidate = row.find((cell: any) => typeof cell === 'string' && /^AC9M[A-Z0-9_]+$/.test(cell));
        if (!codeCandidate || codeCandidate.includes('_E')) continue;

        const subject = row[1] || row[0] || 'Mathematics';
        const yearLevel = row[2] || '';
        const description = row.find((cell: any) => typeof cell === 'string' && cell.length > 20 && cell !== subject && cell !== yearLevel) || '';

        if (!description) continue;

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
    const vectors = await pMap(standards, async (std, index) => {
        try {
            if (index % 10 === 0) console.log(`   Progress: ${index}/${standards.length}`);
            const embedding = await getEmbedding(std.textToEmbed);
            return {
                id: std.id,
                desc: std.desc,
                strand: std.strand,
                embedding
            };
        } catch (e: any) {
            console.error(`❌ Failed standard ${std.id}: ${e.message}`);
            return null;
        }
    }, { concurrency: 5 });

    const finalVectors = vectors.filter(v => v !== null);

    console.log(`💾 Saving ${finalVectors.length} vectors to ${OUTPUT_PATH}...`);
    const dataDir = path.dirname(OUTPUT_PATH);
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(finalVectors, null, 2));
    console.log('✅ Done!');
}

run().catch(console.error);
