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
async function findRecent(userId) {
    console.log(`Searching for jobs for user ${userId} (in-memory sort)...`);
    try {
        const snapshot = await db.collection('generationJobs')
            .where('userId', '==', userId)
            .get();
        if (snapshot.empty) {
            console.log('No jobs found for this user.');
            return;
        }
        const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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
    }
    catch (e) {
        console.error('Error:', e.message);
    }
}
const userId = process.argv[2];
if (!userId) {
    console.error('Usage: ts-node findRecent.ts <userId>');
    process.exit(1);
}
findRecent(userId);
