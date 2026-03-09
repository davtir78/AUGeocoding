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
const analyzer_1 = require("../knowledge/analyzer");
// Initialize Admin SDK if not already
if (!admin.apps.length) {
    admin.initializeApp({
        projectId: 'scholars-alley-dev',
        storageBucket: 'scholars-alley-dev.firebasestorage.app'
    });
}
async function runTest() {
    console.log("--- Starting Ambiguity Detection Test ---");
    // We'll use a text-only input that is intentionally ambiguous (missing options)
    const inputData = {
        fileUrl: "", // Text only
        type: 'test_paper',
        sourceName: 'Ambiguity Test',
        yearLevel: 'Year 5',
        text: 'Question 1: What color is the sky? A) Green B) Red'
    };
    try {
        console.log("Calling analyzeArtifact with ambiguous text...");
        const result = await (0, analyzer_1.analyzeArtifact)('TEST_USER_ID', inputData);
        console.log("Analysis Result:", JSON.stringify(result, null, 2));
        // Validation Logic
        if (result.status === 'needs_clarification') {
            console.log("✅ verified: AI detected ambiguity as expected.");
            console.log(`Clarification Question: ${result.clarificationQuestion}`);
            // Further verification: Check Firestore for 'needs_clarification' status
            const db = admin.firestore();
            const items = await db.collection('knowledge_items')
                .where('source_name', '==', 'Ambiguity Test')
                .where('extraction_status', '==', 'needs_clarification')
                .limit(1)
                .get();
            if (items.empty) {
                throw new Error("No knowledge item with 'needs_clarification' status found in Firestore.");
            }
            console.log("✅ verified: Firestore record updated correctly.");
            process.exit(0);
        }
        else {
            console.error("❌ FAILED: AI did not detect ambiguity. It should have flagged the missing correct option.");
            process.exit(1);
        }
    }
    catch (e) {
        console.error("❌ TEST FAILED:", e);
        process.exit(1);
    }
}
if (require.main === module) {
    runTest();
}
