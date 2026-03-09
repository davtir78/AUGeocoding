
import * as admin from 'firebase-admin';

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.GCLOUD_PROJECT = 'scholars-alley';

if (!admin.apps.length) {
    admin.initializeApp({ projectId: 'scholars-alley' });
}

const db = admin.firestore();

async function testConnection() {
    console.log('Testing Firestore connection...');
    const start = Date.now();
    try {
        await db.collection('diagnostics').doc('ping').set({
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            message: 'pong'
        });
        console.log(`✓ Write successful in ${Date.now() - start}ms`);
    } catch (e) {
        console.error('✗ Write failed:', e);
    }
}

testConnection();
