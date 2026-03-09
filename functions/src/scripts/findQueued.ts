
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
    admin.initializeApp({
        projectId: 'scholars-alley-dev'
    });
}

const db = admin.firestore();

async function findQueued() {
    console.log("Searching for queued jobs for user dUzDRJkK7SOrtdGWBQi6ikrSyPk1...");
    const snapshot = await db.collection('generationJobs')
        .where('userId', '==', 'dUzDRJkK7SOrtdGWBQi6ikrSyPk1')
        .where('status', '==', 'queued')
        .get();

    if (snapshot.empty) {
        console.log("No queued jobs found for this user.");
        return;
    }

    snapshot.forEach(doc => {
        console.log("FOUND QUEUED JOB:");
        console.log(JSON.stringify({ id: doc.id, ...doc.data() }, null, 2));
    });
}

findQueued().catch(console.error);
