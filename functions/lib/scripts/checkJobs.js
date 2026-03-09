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
    const jobs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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
