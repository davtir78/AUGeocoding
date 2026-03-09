
import * as admin from 'firebase-admin';
import * as fs from 'fs';

// Initialize Admin SDK if not already
if (!admin.apps.length) {
    admin.initializeApp({
        projectId: 'scholars-alley-dev',
        storageBucket: 'scholars-alley-dev.firebasestorage.app'
    });
}

const db = admin.firestore();
const TEST_IMAGE_PATH = "c:\\Users\\davti\\OneDrive\\Documents\\Tech\\Code\\scholars-alley\\Docs\\Assets\\fahrenheit 451 extract.png";
const TEST_TEXT_PATH = "c:\\Users\\davti\\OneDrive\\Documents\\Tech\\Code\\scholars-alley\\Docs\\Assets\\farenheit 451 extract.txt";
const TEST_USER_ID = "dUzDRJkK7SOrtdGWBQi6ikrSyPk1";

async function runTest() {
    console.log("--- Starting Fahrenheit 451 Job-Based E2E Test ---");

    if (!fs.existsSync(TEST_IMAGE_PATH)) {
        console.error(`FAILED: Test image not found at ${TEST_IMAGE_PATH}`);
        process.exit(1);
    }

    const testText = fs.readFileSync(TEST_TEXT_PATH, 'utf-8').trim();
    console.log(`Using Test Text: "${testText}"`);

    console.log("Uploading test image for job...");
    const bucket = admin.storage().bucket();
    const destination = `tests/e2e_fahrenheit/${Date.now()}_fahrenheit.png`;
    await bucket.upload(TEST_IMAGE_PATH, {
        destination,
        public: true
    });

    const url = `https://storage.googleapis.com/${bucket.name}/${destination}`;
    console.log(`Test Image URL: ${url}`);

    const sourceName = `Fahrenheit E2E ${Date.now()}`;
    // Create a Generation Job directly in Firestore
    console.log(`Submitting job "${sourceName}" into Firestore for User ${TEST_USER_ID}...`);
    const jobRef = db.collection('generationJobs').doc();
    const now = admin.firestore.FieldValue.serverTimestamp();

    await jobRef.set({
        userId: TEST_USER_ID,
        type: 'artifact',
        status: 'queued',
        input: {
            fileUrl: url,
            type: 'test_paper',
            sourceName: sourceName,
            yearLevel: 'Year 10',
            text: testText
        },
        createdAt: now,
        updatedAt: now
    });

    console.log(`Job created: ${jobRef.id}. Waiting for processing...`);

    // Poll for completion
    let attempts = 0;
    while (attempts < 60) { // 2 minutes max
        const jobSnap = await jobRef.get();
        const jobData = jobSnap.data();

        if (jobData?.status === 'completed') {
            console.log("✅ Job completed successfully!");
            break;
        } else if (jobData?.status === 'failed') {
            console.error("❌ Job failed:", jobData.error || "Unknown error");
            process.exit(1);
        }

        process.stdout.write(".");
        await new Promise(r => setTimeout(r, 2000));
        attempts++;
    }

    if (attempts >= 60) {
        console.error("❌ TIMEOUT: Job did not complete in time.");
        process.exit(1);
    }

    console.log("\nVerifying resulting knowledge item...");
    const items = await db.collection('knowledge_items')
        .where('uid', '==', TEST_USER_ID)
        .where('source_name', '==', sourceName)
        .get();

    if (items.empty) {
        console.error("❌ FAILED: No knowledge item found for the finished job.");
        process.exit(1);
    }

    const data = items.docs[0].data();
    console.log("Created Item Data (FULL):", JSON.stringify(data, null, 2));

    const extracted = (data.extracted_text || "").toLowerCase();
    const ideal = (data.ideal_answer || "").toLowerCase();

    // Verification Logic
    let success = true;
    if (!extracted.includes('pleasure to burn')) {
        console.error("❌ FAILED: Extraction truncated. 'pleasure to burn' missing.");
        success = false;
    } else {
        console.log("✅ verified: Full passage context found.");
    }

    if (!ideal.includes('fireman')) {
        console.error(`❌ FAILED: Wrong answer. Expected 'fireman', got: ${data.ideal_answer}`);
        success = false;
    } else {
        console.log("✅ verified: Correct answer 'fireman' found.");
    }

    if (success) {
        console.log("✅ E2E TEST PASSED");
        process.exit(0);
    } else {
        process.exit(1);
    }
}

if (require.main === module) {
    runTest();
}
