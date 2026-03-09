
import * as admin from 'firebase-admin';

const projectId = 'scholars-alley-dev';

if (!admin.apps.length) {
    admin.initializeApp({
        projectId: projectId
    });
}

const db = admin.firestore();

async function findRecent(userId: string) {
    console.log(`Searching for jobs for user ${userId} (in-memory sort)...`);
    try {
        const snapshot = await db.collection('generationJobs')
            .where('userId', '==', userId)
            .get();

        if (snapshot.empty) {
            console.log('No jobs found for this user.');
            return;
        }

        const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));

        // Sort in-memory desc by createdAt
        docs.sort((a, b) => {
            const timeA = a.createdAt?.seconds || 0;
            const timeB = b.createdAt?.seconds || 0;
            return timeB - timeA;
        });

        docs.slice(0, 10).forEach(data => {
            console.log('\nJOB FOUND:', data.id);
            console.log(`Type: ${data.type}`);
            console.log(`Status: ${data.status}`);
            console.log(`Created: ${data.createdAt?.toDate().toISOString()}`);
            console.log('Input:', JSON.stringify(data.input, null, 2));
        });
    } catch (e: any) {
        console.error('Error:', e.message);
    }
}

const userId = process.argv[2];
if (!userId) {
    console.error('Usage: ts-node findRecent.ts <userId>');
    process.exit(1);
}

findRecent(userId);
