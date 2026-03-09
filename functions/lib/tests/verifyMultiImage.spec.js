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
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
// Initialize Firebase Admin for script execution
const PROJECT_ID = 'scholars-alley-dev';
process.env.GCLOUD_PROJECT = PROJECT_ID;
if (!admin.apps.length) {
    admin.initializeApp({
        projectId: PROJECT_ID,
        storageBucket: 'scholars-alley-dev.firebasestorage.app'
    });
}
const db = admin.firestore();
const TEST_USER_ID = 'dUzDRJkK7SOrtdGWBQi6ikrSyPk1'; // User from logs
const ASSETS_DIR = path.join(__dirname, '../../../Docs/Assets');
const IMAGE_FILES = [
    'english text on drought.png',
    'maths 1.png',
    'maths 2 with image.png'
];
async function runTest() {
    console.log("--- Starting Multi-Image Artifact Submission Test ---");
    try {
        const bucket = admin.storage().bucket();
        const uploadedUrls = [];
        for (const filename of IMAGE_FILES) {
            const filePath = path.join(ASSETS_DIR, filename);
            if (!fs.existsSync(filePath)) {
                console.error(`Missing asset: ${filePath}`);
                process.exit(1);
            }
            const destination = `tests/multi_image/${Date.now()}_${filename}`;
            console.log(`Uploading ${filename}...`);
            await bucket.upload(filePath, {
                destination,
                public: true
            });
            const url = `https://storage.googleapis.com/${bucket.name}/${encodeURIComponent(destination)}`;
            uploadedUrls.push(url);
            console.log(`Uploaded! URL: ${url}`);
        }
        console.log(`\nSubmitting ${uploadedUrls.length} separate jobs to Firestore...`);
        for (let i = 0; i < uploadedUrls.length; i++) {
            const url = uploadedUrls[i];
            const sourceName = `Multi Image Test Part ${i + 1}`;
            const jobRef = db.collection('generationJobs').doc();
            const now = admin.firestore.FieldValue.serverTimestamp();
            const jobData = {
                userId: TEST_USER_ID,
                type: 'artifact',
                status: 'queued',
                input: {
                    fileUrl: url,
                    type: 'test_paper',
                    sourceName: sourceName,
                    yearLevel: '5',
                    text: "" // Explicitly testing empty string mirroring user case
                },
                createdAt: now,
                updatedAt: now
            };
            console.log(`Submitting Job ${i + 1}: ${sourceName}...`);
            await jobRef.set(jobData);
            console.log(`Created job ${jobRef.id}`);
        }
        console.log("\n✅ ALL JOBS SUBMITTED SUCCESSFULLY.");
        console.log("Waiting 30 seconds for workers to pick up and process (optional verification)...");
        // Optional: poll for completion of the last job
        const lastJobId = (await db.collection('generationJobs')
            .where('userId', '==', TEST_USER_ID)
            .where('type', '==', 'artifact')
            .orderBy('createdAt', 'desc')
            .limit(1)
            .get()).docs[0].id;
        console.log(`Monitoring last job: ${lastJobId}`);
        let attempts = 0;
        while (attempts < 20) {
            const snap = await db.collection('generationJobs').doc(lastJobId).get();
            const status = snap.data()?.status;
            console.log(`Job Status: ${status}`);
            if (status === 'completed' || status === 'failed')
                break;
            await new Promise(r => setTimeout(r, 10000));
            attempts++;
        }
        console.log("\n--- TEST COMPLETE ---");
        process.exit(0);
    }
    catch (err) {
        console.error("Test failed with error:", err);
        process.exit(1);
    }
}
runTest();
