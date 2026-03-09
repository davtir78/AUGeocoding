
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';
import { analyzeArtifact } from '../knowledge/analyzer';

// Initialize Admin if needed (although scripts usually need specific env setup)
if (!admin.apps.length) {
    admin.initializeApp({
        projectId: 'scholars-alley-dev',
        // credential: admin.credential.applicationDefault() // Rely on local auth
    });
}

// Mock auth context
const TEST_UID = 'test-user-verification';

async function runTest() {
    // 1. Setup paths
    const assetsDir = path.join(__dirname, '../../../Docs/Assets');
    const simpleImage = path.join(assetsDir, 'maths 1.png');
    const complexImage = path.join(assetsDir, 'maths olypiad.png');

    console.log('--- TEST 1: Simple Image (maths 1.png) ---');
    await testImage(simpleImage, 'Simple Math Test');

    console.log('\n\n--- TEST 2: Complex Image (maths olypiad.png) ---');
    await testImage(complexImage, 'Maths Olympiad');
}

async function testImage(filePath: string, sourceName: string) {
    if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        return;
    }

    // Convert to Base64 data URL for the API
    const bitmap = fs.readFileSync(filePath);
    const base64 = Buffer.from(bitmap).toString('base64');
    const dataUrl = `data:image/png;base64,${base64}`;

    console.log(`Analyzing ${path.basename(filePath)}...`);

    try {
        // Call the analyzer directly
        // Note: We might need to inject the API key if it relies on process.env which might be missing in simple node script
        if (!process.env.OPENROUTER_API_KEY) {
            console.warn("WARNING: OPENROUTER_API_KEY is not set in process.env. Test might fail.");
        }

        const result = await analyzeArtifact(TEST_UID, {
            fileUrl: dataUrl,
            type: 'test_paper',
            sourceName: sourceName,
            yearLevel: '5'
        });

        console.log(`\nAnalysis Result for ${sourceName}:`);
        console.log(`Inferred Subject: ${result.inferredSubject}`);
        console.log(`Items Extracted: ${result.count}`);

        // We can't see the specific items because analyzeArtifact returns a summary, 
        // but the console.logs INSIDE analyzeArtifact will show the raw JSON. 
        // That's perfect for verification.

    } catch (e) {
        console.error(`Failed to analyze ${sourceName}:`, e);
    }
}

// Run
runTest().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
