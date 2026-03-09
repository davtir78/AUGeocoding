import * as admin from 'firebase-admin';
import { seed } from '../scripts/seedCurriculum';

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
        await seed({ dryRun: false, limit: 5 });

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

    } catch (error) {
        console.error("\n❌ TEST FAILED with error:", error);
        process.exit(1);
    }
}

runTest();
