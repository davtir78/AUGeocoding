
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

// Inject API Key for Test
process.env.OPENROUTER_API_KEY = "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";

// Initialize Admin SDK *BEFORE* importing any other files that might use it
if (admin.apps.length === 0) {
    admin.initializeApp({
        projectId: 'scholars-alley-dev',
        credential: admin.credential.applicationDefault()
    });
}

async function testFlow() {
    console.log("Starting End-to-End Unit Test (Base64 Mode)...");

    // Dynamic import to avoid hoisting issues causing "default app does not exist"
    // We use require() here so it runs AFTER admin.initializeApp
    const { analyzeArtifact } = require('../knowledge/processArtifactUpload');

    const imagePath = path.resolve(__dirname, '../../../Docs/Assets/maths 1.png');

    if (!fs.existsSync(imagePath)) {
        console.error(`Image not found at: ${imagePath}`);
        return;
    }

    try {
        console.log(`Reading image as Base64...`);
        const bitmap = fs.readFileSync(imagePath);
        const base64 = bitmap.toString('base64');
        const dataUrl = `data:image/png;base64,${base64}`;

        console.log(`Image prepared (Base64 length: ${base64.length})`);

        const testData = {
            fileUrl: dataUrl, // Use Data URI for AI
            type: 'test_paper',
            sourceName: 'Unit Test Maths 1',
            yearLevel: '5'
        };

        const testUid = 'UNIT_TEST_USER';

        console.log("Invoking analyzeArtifact logic...");
        const result = await analyzeArtifact(testUid, testData);

        console.log("------------------------------------------------");
        console.log("SUCCESS! Result:", JSON.stringify(result, null, 2));
        console.log("------------------------------------------------");

    } catch (e) {
        console.error("TEST FAILED:", e);
    }
}

testFlow().catch(console.error);
