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
const path = __importStar(require("path"));
// Initialize Admin SDK if not already
if (!admin.apps.length) {
    admin.initializeApp({
        projectId: 'scholars-alley-dev',
        storageBucket: 'scholars-alley-dev.firebasestorage.app'
    });
}
const db = admin.firestore();
const TEST_USER_ID = "dUzDRJkK7SOrtdGWBQi6ikrSyPk1";
const sourceName = `Fahrenheit Integration Test ${Date.now()}`; // Unique source to force generation
const ASSETS_DIR = "c:\\Users\\davti\\OneDrive\\Documents\\Tech\\Code\\scholars-alley\\Docs\\Assets";
const TEST_CASES = [
    {
        filename: "fahrenheit 451 extract.png",
        sourceName: sourceName,
        type: "test_paper",
        expectedText: ["pleasure to burn", "python"],
        expectedAnswer: ["fireman"]
    },
    {
        filename: "english text on drought.png",
        sourceName: "Drought Integration Test",
        type: "worksheet",
        expectedText: ["drought", "cattle"],
        expectedAnswer: ["325"] // 650/2
    },
    {
        filename: "maths 1.png",
        sourceName: "Math Integration Test",
        type: "worksheet",
        expectedText: ["calculate", "triangle", "area"],
        // Basic geometry check if possible, or just checks text extraction for math symbols
        expectedAnswer: []
    }
];
async function runTest() {
    console.log("--- Starting Comprehensive Artifact Integration Test ---");
    let overallSuccess = true;
    for (const testCase of TEST_CASES) {
        console.log(`\n\n>>> PROCESSING: ${testCase.filename}`);
        const success = await processArtifact(testCase);
        if (!success)
            overallSuccess = false;
    }
    if (overallSuccess) {
        console.log("\n✅ ALL INTEGRATION TESTS PASSED");
        process.exit(0);
    }
    else {
        console.error("\n❌ SOME TESTS FAILED");
        process.exit(1);
    }
}
async function processArtifact(testCase) {
    const filePath = path.join(ASSETS_DIR, testCase.filename);
    if (!fs.existsSync(filePath)) {
        console.error(`❌ FAILED: File not found: ${filePath}`);
        return false;
    }
    // 1. Upload
    console.log(`Uploading ${testCase.filename}...`);
    const bucket = admin.storage().bucket();
    const sanitizedName = testCase.filename.replace(/\s+/g, '_');
    const destination = `tests/integration/${Date.now()}_${sanitizedName}`;
    await bucket.upload(filePath, { destination, public: true });
    // Construct valid URL (encoding path segments)
    const url = `https://storage.googleapis.com/${bucket.name}/${encodeURIComponent(destination).replace(/%2F/g, '/')}`;
    // 2. Submit Job
    console.log("Submitting Generation Job...");
    const jobRef = db.collection('generationJobs').doc();
    const now = admin.firestore.FieldValue.serverTimestamp();
    await jobRef.set({
        userId: TEST_USER_ID,
        type: 'artifact',
        status: 'queued',
        input: {
            fileUrl: url,
            type: testCase.type,
            sourceName: testCase.sourceName,
            yearLevel: 'Year 10',
            text: `Integration Test for ${testCase.filename}`
        },
        createdAt: now,
        updatedAt: now
    });
    // 3. Poll
    console.log(`Job ID: ${jobRef.id}. Waiting...`);
    let attempts = 0;
    while (attempts < 90) { // 3 minutes max
        const snap = await jobRef.get();
        const data = snap.data();
        if (data?.status === 'completed') {
            console.log("Job Completed.");
            console.log("Job Data Dump:", JSON.stringify(data, null, 2));
            break;
        }
        if (data?.status === 'failed') {
            console.error(`❌ Job Failed: ${data.error}`);
            return false;
        }
        process.stdout.write(".");
        await new Promise(r => setTimeout(r, 2000));
        attempts++;
    }
    if (attempts >= 90) {
        console.error("❌ TIMEOUT");
        return false;
    }
    // Wait for consistency
    console.log("Waiting 5s for Firestore consistency...");
    await new Promise(r => setTimeout(r, 5000));
    // 4. Verify
    console.log(`Verifying Output for Source: ${testCase.sourceName}...`);
    // Debug: Print all items for user to see if Source Name is mismatching
    const allItems = await db.collection('knowledge_items').where('uid', '==', TEST_USER_ID).get();
    console.log(`Total Items for User: ${allItems.size}`);
    const items = await db.collection('knowledge_items')
        .where('uid', '==', TEST_USER_ID)
        .where('source_name', '==', testCase.sourceName)
        .get();
    if (items.empty) {
        console.error(`❌ No knowledge items found for source_name: "${testCase.sourceName}"`);
        // Debug: Show 5 most recent items
        console.log("Dumping 5 most recent items for user:");
        const recent = await db.collection('knowledge_items')
            .where('uid', '==', TEST_USER_ID)
            .orderBy('created_at', 'desc')
            .limit(5)
            .get();
        recent.docs.forEach(doc => {
            const d = doc.data();
            console.log(`- ID: ${doc.id}, Source: "${d.source_name}", Title: "${d.title}"`);
        });
        return false;
    }
    // Check first item (simplification)
    const data = items.docs[0].data();
    const extracted = (data.extracted_text || "").toLowerCase();
    const answer = (data.ideal_answer || "").toLowerCase();
    // Check Expected Text
    for (const text of testCase.expectedText) {
        if (!extracted.includes(text.toLowerCase())) {
            console.error(`❌ Missing text: "${text}"`);
            return false;
        }
    }
    // Check Expected Answer
    for (const ans of testCase.expectedAnswer) {
        if (!answer.includes(ans.toLowerCase())) {
            console.error(`❌ Wrong answer. Expected "${ans}", got: "${data.ideal_answer}"`);
            console.log("FULL ITEM DATA:", JSON.stringify(data, null, 2));
            return false;
        }
    }
    console.log("✅ verified.");
    return true;
}
if (require.main === module) {
    runTest();
}
