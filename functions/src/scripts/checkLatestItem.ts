
import * as admin from 'firebase-admin';

// Initialize Firebase Admin
if (admin.apps.length === 0) {
    admin.initializeApp();
}

async function checkLatestItem() {
    const db = admin.firestore();
    console.log("Fetching latest knowledge item...");

    // Query knowledge_items ordered by created_at desc
    const snapshot = await db.collection('knowledge_items')
        .orderBy('created_at', 'desc')
        .limit(1)
        .get();

    if (snapshot.empty) {
        console.log("No items found.");
        return;
    }

    const doc = snapshot.docs[0];
    const data = doc.data();

    console.log(`\n=== ITEM ${doc.id} ===`);
    console.log("Title:", data.title);
    console.log("Status:", data.extraction_status);
    console.log("Source:", data.source_name);
    console.log("\n--- IDEAL ANSWER ---");
    console.log(data.ideal_answer || "[EMPTY]");
    console.log("\n--- STUDENT ANSWER ---");
    console.log(data.student_answer || "[EMPTY]");
    console.log("\n--- EXTRACTED TEXT ---");
    console.log((data.extracted_text || "").substring(0, 200) + "...");

    // Check key fields
    if (data.ideal_answer && data.ideal_answer.length > 50) {
        console.log("\n✅ VICTORY: Ideal Answer populated!");
    } else {
        console.log("\n❌ FAILURE: Ideal Answer empty or too short.");
    }
}

checkLatestItem().catch(console.error);
