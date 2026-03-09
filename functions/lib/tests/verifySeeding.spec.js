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
const seedCurriculum_1 = require("../scripts/seedCurriculum");
// Initialize Admin SDK (uses default credentials from environment)
// This matches the pattern in testPresentationProcessing.spec.ts
if (!admin.apps.length) {
    admin.initializeApp({
        projectId: 'scholars-alley-dev',
    });
}
const db = admin.firestore();
async function runTest() {
    console.log("--- Starting Seeding Unit Test ---");
    try {
        // 1. Run Seed with Limit (Write to DB)
        console.log("Running seed script (Limit: 5 items)...");
        await (0, seedCurriculum_1.seed)({ dryRun: false, limit: 5 });
        // 2. Verify Data in Firestore
        console.log("Verifying data in Firestore...");
        // Check for any document in curriculum_standards
        const snapshot = await db.collection('curriculum_standards').limit(5).get();
        if (snapshot.empty) {
            console.error("FAILED: No documents found in 'curriculum_standards'.");
            process.exit(1);
        }
        const count = snapshot.size;
        console.log(`Found ${count} documents.`);
        const firstDoc = snapshot.docs[0].data();
        console.log("Sample Document:", JSON.stringify(firstDoc, null, 2));
        // Validate Fields
        if (!firstDoc.id || !firstDoc.subject || !firstDoc.description) {
            console.error("FAILED: Document missing required fields.");
            process.exit(1);
        }
        if (firstDoc.version !== '9.0') {
            console.error(`FAILED: Version mismatch. Expected '9.0', got '${firstDoc.version}'`);
            process.exit(1);
        }
        if (!firstDoc.year_level) {
            console.error("FAILED: Year Level missing.");
            process.exit(1);
        }
        console.log(`[PASS] Version: ${firstDoc.version}, Year: ${firstDoc.year_level}`);
        // 3. Success
        console.log("\n✅ SEEDING TEST PASSED");
        process.exit(0);
    }
    catch (error) {
        console.error("\n❌ TEST FAILED with error:", error);
        process.exit(1);
    }
}
runTest();
