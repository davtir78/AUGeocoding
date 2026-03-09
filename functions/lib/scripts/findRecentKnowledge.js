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
            .map(doc => ({ id: doc.id, ...doc.data() }))
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
    }
    catch (e) {
        console.error('Error:', e.message);
    }
}
findRecentKnowledge();
