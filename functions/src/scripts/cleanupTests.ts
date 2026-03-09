
import * as admin from 'firebase-admin';

const projectId = 'scholars-alley-dev';

if (!admin.apps.length) {
    admin.initializeApp({
        projectId: projectId
    });
}

const db = admin.firestore();
const TEST_UID = 'dUzDRJkK7SOrtdGWBQi6ikrSyPk1';
const TEST_SOURCES = [
    'Automation Test: Simple Math',
    'Automation Test: Medium Math',
    'Automation Test: Hard Math'
];

async function cleanup() {
    console.log("🧹 Starting Cleanup of Test Artifacts...");

    // 1. Cleanup knowledge_items
    console.log("Step 1: Deleting knowledge_items...");
    const itemsSnapshot = await db.collection('knowledge_items')
        .where('uid', '==', TEST_UID)
        .where('source_name', 'in', TEST_SOURCES)
        .get();

    if (itemsSnapshot.empty) {
        console.log("No matching knowledge_items found.");
    } else {
        const batch = db.batch();
        itemsSnapshot.forEach(doc => {
            batch.delete(doc.ref);
            console.log(`- Deleting item: ${doc.id}`);
        });
        await batch.commit();
        console.log(`✅ Deleted ${itemsSnapshot.size} knowledge_items.`);
    }

    // 2. Cleanup generationJobs
    console.log("\nStep 2: Deleting generationJobs...");
    const jobsSnapshot = await db.collection('generationJobs')
        .where('userId', '==', TEST_UID)
        .where('type', '==', 'artifact')
        .get();

    if (jobsSnapshot.empty) {
        console.log("No matching generationJobs found.");
    } else {
        const batch = db.batch();
        let count = 0;
        jobsSnapshot.forEach(doc => {
            const input = doc.data().input;
            if (input && TEST_SOURCES.includes(input.sourceName)) {
                batch.delete(doc.ref);
                console.log(`- Deleting job: ${doc.id}`);
                count++;
            }
        });
        if (count > 0) {
            await batch.commit();
            console.log(`✅ Deleted ${count} generationJobs.`);
        } else {
            console.log("No jobs matched the test source names.");
        }
    }

    console.log("\n🏁 Cleanup Finished.");
}

cleanup().catch(console.error);
