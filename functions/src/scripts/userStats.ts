
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
    admin.initializeApp({
        projectId: 'scholars-alley-dev'
    });
}

const db = admin.firestore();

async function listUsers() {
    const snapshot = await db.collection('generationJobs').get();
    const stats: Record<string, any> = {};

    snapshot.forEach(doc => {
        const data = doc.data();
        const uid = data.userId || 'unknown';
        if (!stats[uid]) {
            stats[uid] = {
                total: 0,
                queued: 0,
                processing: 0,
                failed: 0,
                artifact: 0,
                other: 0
            };
        }
        stats[uid].total++;
        if (data.status === 'queued') stats[uid].queued++;
        if (data.status === 'processing') stats[uid].processing++;
        if (data.status === 'failed') stats[uid].failed++;
        if (data.type === 'artifact') stats[uid].artifact++;
        else stats[uid].other++;
    });

    console.log("User Stats in generationJobs:");
    console.table(stats);
}

listUsers().catch(console.error);
