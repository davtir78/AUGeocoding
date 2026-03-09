"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const admin = __importStar(require("firebase-admin"));
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
    }
    else {
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
    }
    else {
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
        }
        else {
            console.log("No jobs matched the test source names.");
        }
    }
    console.log("\n🏁 Cleanup Finished.");
}
cleanup().catch(console.error);
