
import * as admin from 'firebase-admin';
import * as XLSX from 'xlsx';
import { CompetencyAtom } from '../lib/types/curriculum';
import * as crypto from 'crypto';

// Remove emulator forcing
// process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';

// Explicitly set Project ID for Cloud Connection
const PROJECT_ID = 'scholars-alley-dev'; // Confirmed from .firebaserc
process.env.GCLOUD_PROJECT = PROJECT_ID;

// Initialize Firebase Admin with Google Application Default Credentials
if (!admin.apps.length) {
    admin.initializeApp({
        projectId: PROJECT_ID,
        credential: admin.credential.applicationDefault()
    });
}

const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

const WORKBOOK_PATH = "c:\\Users\\davti\\OneDrive\\Documents\\Tech\\Code\\scholars-alley\\Docs\\ProjectPlan\\curriculum-workbook.xlsx";

// Helper to normalized Year Levels (AUS specific)
function normalizeLevels(levelStr: string): number[] {
    const levels: number[] = [];
    if (!levelStr) return levels;

    // Handle "Years 1 and 2" or "Foundation"
    if (levelStr.includes("Foundation")) levels.push(0);

    // Extract numbers
    const matches = levelStr.match(/\d+/g);
    if (matches) {
        matches.forEach(m => levels.push(parseInt(m)));
    }

    return levels;
}

// Helper to generate UUID v5 (Name-based) for consistency if needed, 
// but for now we'll use a random UUID v4 or mapping based on Code
function generateCodeId(code: string): string {
    // For ACARA, the code is unique and stable. We'll hash it to get a consistent 
    // ID that looks like a UUID, or just use Firestore auto-id if we wanted.
    // Let's use MD5 of code to allow re-seeding update ease (idempotency).
    return crypto.createHash('md5').update(code).digest('hex');
}

export interface SeedOptions {
    dryRun?: boolean;
    limit?: number;
}

export async function seed(options: SeedOptions = {}) {
    const { dryRun = false, limit } = options;
    console.log(`Reading workbook from: ${WORKBOOK_PATH}`);
    const workbook = XLSX.readFile(WORKBOOK_PATH);
    const sheet = workbook.Sheets['Learning areas'];

    // Read raw data
    const rawData = XLSX.utils.sheet_to_json(sheet) as any[];
    console.log(`Total rows to process: ${rawData.length}`);

    // Group by Code to aggregate Elaborations and Topics
    const standardsMap = new Map<string, CompetencyAtom>();

    for (const row of rawData) {
        const code = row['Code'];
        if (!code) continue;

        if (!standardsMap.has(code)) {
            // Create new Atom
            const id = generateCodeId(code);
            const levelStr = row['Level'] || '';
            const normalizedYears = normalizeLevels(levelStr);

            const atom: CompetencyAtom = {
                id: id,
                canonical_code: code,
                type: 'ContentDescription', // ACARA terminology
                jurisdiction: {
                    country: 'AUS',
                    region: 'National',
                    authority: 'ACARA'
                },
                educational_context: {
                    subject: row['Subject'] || row['Learning Area'] || 'Unknown Subject',
                    native_label: levelStr,
                    normalized_year_levels: normalizedYears,
                    age_range: {
                        min: 5 + Math.min(...(normalizedYears.length ? normalizedYears : [0])),
                        max: 6 + Math.max(...(normalizedYears.length ? normalizedYears : [12]))
                    }
                },
                hierarchy_context: {
                    native_node_type: 'Content Description',
                    taxonomy_path: [row['Learning Area'], row['Strand'], row['Sub-Strand']].filter(Boolean)
                },
                statement: {
                    full_text: row['Content Description'] || 'No description provided',
                    keywords: [],
                    elaborations: []
                },
                audit: {
                    version: 'v9.0',
                    last_updated: new Date().toISOString(),
                    status: 'Active'
                }
            };

            standardsMap.set(code, atom);
        }

        // Aggregate Elaborations
        const existing = standardsMap.get(code)!;
        if (row['Elaboration'] && !existing.statement.elaborations?.includes(row['Elaboration'])) {
            existing.statement.elaborations?.push(row['Elaboration']);
        }

        // Aggregate Topics (split by comma if needed, usually they are singular in rows? Let's assume text)
        // If "Topics" column contains "Fractions, Decimals", split it
        if (row['Topics']) {
            const topics = row['Topics'].toString().split(',').map((t: string) => t.trim());
            topics.forEach((t: string) => {
                if (!existing.statement.keywords.includes(t)) {
                    existing.statement.keywords.push(t);
                }
            });
        }
    }

    console.log(`Unique Standards identified: ${standardsMap.size}`);
    console.log(`Starting Firestore batch write operations...`);

    // Batch write to Firestore
    const batchSize = 100; // Reduce batch size to see progress faster
    let batch = db.batch();
    let count = 0;
    let totalWritten = 0;
    let batchIndex = 0;

    for (const atom of standardsMap.values()) {
        if (limit && totalWritten + count >= limit) break;

        if (dryRun) {
            console.log(`[DRY RUN] Would write standard: ${atom.canonical_code}`);
            count++;
        } else {
            const ref = db.collection('curriculum_standards').doc(atom.id);
            batch.set(ref, atom);
            count++;
        }

        if (count >= batchSize) {
            batchIndex++;
            console.log(`Committing batch ${batchIndex} (Items ${totalWritten + 1}-${totalWritten + count})...`);
            try {
                await batch.commit();
                totalWritten += count;
                console.log(`✓ Batch ${batchIndex} committed. Total written: ${totalWritten}`);
            } catch (err) {
                console.error(`Error committing batch ${batchIndex}:`, err);
            }
            batch = db.batch();
            count = 0;
        }
    }

    if (count > 0) {
        await batch.commit();
        totalWritten += count;
    }

    console.log(`Finished! Total standards written: ${totalWritten}`);
}

// Only auto-execute if run directly
if (require.main === module) {
    seed().catch(console.error);
}
