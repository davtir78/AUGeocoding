
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
    admin.initializeApp({
        projectId: 'scholars-alley-dev'
    });
}

const db = admin.firestore();

async function debugJobs() {
    console.log("Checking all artifact jobs (manual filter)...");
    const snapshot = await db.collection('generationJobs').get();

    if (snapshot.empty) {
        console.log("No jobs found in collection.");
        return;
    }

    const jobs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));

    const artifactJobs = jobs.filter(j => j.type === 'artifact');
    const queuedJobs = artifactJobs.filter(j => j.status === 'queued');

    console.log(`Total jobs: ${jobs.length}`);
    console.log(`Artifact jobs: ${artifactJobs.length}`);
    console.log(`Queued artifact jobs: ${queuedJobs.length}`);

    if (queuedJobs.length > 0) {
        console.log("\nQueued Jobs Details:");
        queuedJobs.forEach(j => {
            console.log(`- Job ID: ${j.id}`);
            console.log(`  User ID: ${j.userId}`);
            console.log(`  Created At: ${j.createdAt?.toDate?.() || j.createdAt}`);
            console.log(`  Source: ${j.input?.sourceName}`);
        });
    }

    const recentJobs = artifactJobs
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
        .slice(0, 5);

    console.log("\nRecently Processed/Failed Artifact Jobs:");
    recentJobs.forEach(j => {
        console.log(`- ID: ${j.id} | Status: ${j.status} | Created: ${j.createdAt?.toDate?.() || j.createdAt}`);
    });
}

debugJobs().catch(console.error);
