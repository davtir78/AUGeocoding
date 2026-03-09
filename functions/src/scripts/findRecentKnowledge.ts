
import * as admin from 'firebase-admin';

const projectId = 'scholars-alley-dev';

if (!admin.apps.length) {
    admin.initializeApp({
        projectId: projectId
    });
}

const db = admin.firestore();
const TEST_UID = 'dUzDRJkK7SOrtdGWBQi6ikrSyPk1';

async function findRecentKnowledge() {
    console.log(`Filtering knowledge items for Automation Tests for user ${TEST_UID}...`);
    try {
        const snapshot = await db.collection('knowledge_items')
            .where('uid', '==', TEST_UID)
            .get();

        if (snapshot.empty) {
            console.log('No knowledge items found for this user.');
            return;
        }

        const items = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() as any }))
            .filter(item => item.source_name?.startsWith('Automation Test:'));

        // Sort in-memory desc by created_at
        items.sort((a, b) => {
            const timeA = a.created_at?.seconds || 0;
            const timeB = b.created_at?.seconds || 0;
            return timeB - timeA;
        });

        if (items.length === 0) {
            console.log('No automation test items found.');
            return;
        }

        console.log(`\nDEBUG: Found ${items.length} automation items. Keys:`, Object.keys(items[0]));

        items.forEach(data => {
            console.log('\n--- ITEM FOUND:', data.id);
            console.log(`Title: ${data.title || 'MISSING'}`);
            console.log(`Classification: ${data.subject} | ${data.year_level} | ${data.strand}`);
            console.log(`Source: ${data.source_name}`);
            console.log(`Question: ${data.extracted_text?.substring(0, 50)}...`);
            console.log(`Ideal: ${data.ideal_answer || 'MISSING'}`);
            console.log(`Expl: ${data.explanation?.substring(0, 100)}...`);
            console.log(`Curriculum: ${JSON.stringify(data.curriculum_links)}`);
        });
    } catch (e: any) {
        console.error('Error:', e.message);
    }
}

findRecentKnowledge();
