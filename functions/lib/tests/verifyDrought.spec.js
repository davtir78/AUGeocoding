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
const admin = __importStar(require("firebase-admin"));
const fs = __importStar(require("fs"));
// Initialize Admin SDK if not already
if (!admin.apps.length) {
    admin.initializeApp({
        projectId: 'scholars-alley-dev',
        storageBucket: 'scholars-alley-dev.firebasestorage.app'
    });
}
const db = admin.firestore();
const TEST_IMAGE_PATH = "c:\\Users\\davti\\OneDrive\\Documents\\Tech\\Code\\scholars-alley\\Docs\\Assets\\english text on drought.png";
const TEST_TEXT_PATH = "c:\\Users\\davti\\OneDrive\\Documents\\Tech\\Code\\scholars-alley\\Docs\\Assets\\english text on drought.txt";
const TEST_USER_ID = "dUzDRJkK7SOrtdGWBQi6ikrSyPk1";
async function runTest() {
    console.log("--- Starting Drought Analysis Job-Based E2E Test ---");
    if (!fs.existsSync(TEST_IMAGE_PATH)) {
        console.error(`FAILED: Test image not found at ${TEST_IMAGE_PATH}`);
        process.exit(1);
    }
    const testText = fs.readFileSync(TEST_TEXT_PATH, 'utf-8').trim();
    console.log(`Using Test Text: "${testText}"`);
    console.log("Uploading test image for job...");
    const bucket = admin.storage().bucket();
    const destination = `tests/e2e_drought/${Date.now()}_drought.png`;
    await bucket.upload(TEST_IMAGE_PATH, {
        destination,
        public: true
    });
    const url = `https://storage.googleapis.com/${bucket.name}/${destination}`;
    console.log(`Test Image URL: ${url}`);
    const sourceName = `Drought E2E ${Date.now()}`;
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
            yearLevel: 'Year 5',
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
        }
        else if (jobData?.status === 'failed') {
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
    fs.writeFileSync('drought_test_result.json', JSON.stringify(data, null, 2));
    console.log("Created Item Data saved to drought_test_result.json");
    const extracted = (data.extracted_text || "").toLowerCase();
    const ideal = (data.ideal_answer || "").toLowerCase();
    // Verification Logic for Drought
    let success = true;
    if (!extracted.includes('lengths we go to') && !extracted.includes('hannah brown')) {
        console.error("❌ FAILED: Extraction incomplete. Passage content missing.");
        success = false;
    }
    else {
        console.log("✅ verified: Passage context found.");
    }
    if (!ideal.includes('325')) {
        console.error(`❌ FAILED: Wrong answer behavior. Expected '325', got: ${data.ideal_answer}`);
        // Note: Sometimes the LLM might phrase it as "D) 325" or "325 calves", so including a broad check
        if (!data.ideal_answer.includes('325')) {
            success = false;
        }
        else {
            console.log("✅ verified: Correct answer '325' found.");
        }
    }
    else {
        console.log("✅ verified: Correct answer '325' found.");
    }
    if (success) {
        console.log("✅ E2E TEST PASSED (Drought)");
        process.exit(0);
    }
    else {
        process.exit(1);
    }
}
if (require.main === module) {
    runTest();
}
