
import * as admin from 'firebase-admin';
import { analyzeArtifact } from '../knowledge/analyzer';
import * as fs from 'fs';

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
        const result = await analyzeArtifact('TEST_USER_ID', inputData);

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
        } else {
            console.error("❌ FAILED: AI did not detect ambiguity. It should have flagged the missing correct option.");
            process.exit(1);
        }

    } catch (e) {
        console.error("❌ TEST FAILED:", e);
        process.exit(1);
    }
}

if (require.main === module) {
    runTest();
}
