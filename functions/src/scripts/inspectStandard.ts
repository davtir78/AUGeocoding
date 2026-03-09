
import * as admin from 'firebase-admin';

process.env.GCLOUD_PROJECT = 'scholars-alley-dev';
if (!admin.apps.length) {
    admin.initializeApp({
        projectId: 'scholars-alley-dev',
        credential: admin.credential.applicationDefault()
    });
}

const db = admin.firestore();

async function inspect() {
    // Try to find a Math standard
    console.log("Fetching a sample Mathematics standard...");
    const snapshot = await db.collection('curriculum_standards')
        .where('educational_context.subject', '==', 'Mathematics')
        .limit(1)
        .get();

    if (!snapshot.empty) {
        const data = snapshot.docs[0].data();
        console.log(JSON.stringify(data, null, 2));
    } else {
        console.log("No Mathematics standards found. Trying any standard...");
        const anySnap = await db.collection('curriculum_standards').limit(1).get();
        if (!anySnap.empty) {
            console.log(JSON.stringify(anySnap.docs[0].data(), null, 2));
        } else {
            console.log("Database appears empty?");
        }
    }
}

inspect();
