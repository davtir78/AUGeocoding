
import * as admin from 'firebase-admin';
import { analyzeArtifact } from '../knowledge/analyzer';
import { ModelType } from '../config/model-config';
import * as fs from 'fs';
import * as path from 'path';

// Initialize Admin SDK if not already
if (!admin.apps.length) {
    admin.initializeApp({
        projectId: 'scholars-alley-dev',
        storageBucket: 'scholars-alley-dev.firebasestorage.app'
    });
}

const TEST_IMAGE_PATH = "c:\\Users\\davti\\OneDrive\\Documents\\Tech\\Code\\scholars-alley\\Docs\\Assets\\english text on drought.png";

async function runTest() {
    console.log("--- Starting Hybrid Analysis Verification Test ---");

    if (!fs.existsSync(TEST_IMAGE_PATH)) {
        console.error(`FAILED: Test image not found at ${TEST_IMAGE_PATH}`);
        process.exit(1);
    }

    // Mock Upload Data
    // In a real integration test, we'd upload to storage, but for now let's assume analyzeArtifact 
    // can handle a public URL or we might need to mock the download if it's local.
    // Since analyzeArtifact calls 'fetch', passing a local file path won't work directly 
    // unless we mock fetch or upload it. 
    // 
    // STRATEGY: We will upload it to the dev storage bucket first to get a "gs://" or http URL.

    console.log("Uploading test image to Storage...");
    const bucket = admin.storage().bucket();
    const destination = `tests/hybrid_analysis/${Date.now()}_drought.png`;
    const [file] = await bucket.upload(TEST_IMAGE_PATH, {
        destination,
        public: true
    });

    // Get public URL
    // Note: This relies on the bucket being public or using signed URL
    // Construct public URL manually
    const url = `https://storage.googleapis.com/${bucket.name}/${destination}`;

    console.log(`Test Image URL: ${url}`);

    console.log(`Test Image URL: ${url}`);

    const inputData = {
        fileUrl: url,
        type: 'test_paper',
        sourceName: 'Unit Test Hybrid',
        yearLevel: 'Year 9',
        text: 'How many calves are there in total?'
    };

    try {
        console.log("Calling analyzeArtifact...");
        const result = await analyzeArtifact('TEST_USER_ID', inputData);

        console.log("Analysis Result:", JSON.stringify(result, null, 2));

        // Validation Logic
        // 1. Should have found at least 1 item
        if (result.count < 1) {
            throw new Error("Failed to find any items.");
        }

        // 2. Fetch the created item from Firestore to check details
        // Since analyzeArtifact returns count but not IDs directly in the return signature (it void/status),
        // we might need to query or update analyzeArtifact to return items.
        // Wait, analyzeArtifact returns { success: true, count: number, inferredSubject: string }
        // We'll query recent items for this user.

        console.log("Querying Firestore for created item...");
        const db = admin.firestore();
        const items = await db.collection('knowledge_items')
            .where('source_name', '==', 'Unit Test Hybrid')
            .limit(1)
            .get();

        if (items.empty) {
            throw new Error("No knowledge item created in Firestore.");
        }

        const data = items.docs[0].data();
        console.log("Created Item Data:", JSON.stringify(data, null, 2));

        // 3. CHECK: Did it crop aggressively?
        // If crop_image_url is significantly different from source (context lost), that's bad.
        // Or check the extracted text/answer.
        // Key assertions:
        const answer = (data.student_answer || "").toLowerCase();
        const ideal = (data.ideal_answer || "").toLowerCase();
        const extracted = (data.extracted_text || "").toLowerCase();

        // The answer "325" should be mentioned
        if (!ideal.includes('325') && !extracted.includes('325')) {
            console.error("❌ FAILED: The answer 325 (total calves) was not found in ideal_answer or extracted_text.");
            console.error(`Got Ideal: ${data.ideal_answer}`);
            console.error(`Got Extracted: ${data.extracted_text}`);
            process.exit(1);
        } else {
            console.log("✅ verified: '325' found in analysis.");
        }

        // Check if "question" includes the provided text
        if (!data.title.toLowerCase().includes('calves') && !extracted.includes('calves')) {
            console.warn("⚠️ WARNING: The user question 'How many calves' might not be fully preserved.");
        }

        // 4. CHECK: Detail Extraction (Passage inclusion)
        console.log("Checking for passage inclusion in extracted_text...");
        if (!extracted.includes('drought') && !extracted.includes('water')) {
            console.error("❌ FAILED: The extracted_text does not seem to contain the passage details (drought/water).");
            console.error(`Got Extracted: ${data.extracted_text}`);
            process.exit(1);
        } else {
            console.log("✅ verified: Passage details found in question text.");
        }

        console.log("✅ TEST PASSED");
        process.exit(0);

    } catch (e) {
        console.error("❌ TEST FAILED:", e);
        process.exit(1);
    }
}

if (require.main === module) {
    runTest();
}
