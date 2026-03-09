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
exports.forgeQuest = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const db = admin.firestore();
exports.forgeQuest = functions.region('australia-southeast1')
    .runWith({
    timeoutSeconds: 60,
    memory: '512MB'
})
    .https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be logged in');
    }
    const uid = context.auth.uid;
    const { knowledgeItemIds, mode } = data;
    console.log(`[ForgeQuest] User ${uid} requesting ${mode} quest for ${knowledgeItemIds.length} items`);
    if (!knowledgeItemIds || knowledgeItemIds.length === 0) {
        throw new functions.https.HttpsError('invalid-argument', 'No knowledge items provided');
    }
    try {
        // 1. Fetch Knowledge Items
        const refs = knowledgeItemIds.map(id => db.collection('knowledge_items').doc(id));
        const snapshots = await db.getAll(...refs);
        const validItems = snapshots.filter(s => s.exists).map(s => {
            const d = s.data();
            return { id: s.id, ...d };
        });
        if (validItems.length === 0) {
            throw new functions.https.HttpsError('not-found', 'No valid knowledge items found');
        }
        // 2. Analyze & Aggregate
        const topics = new Set();
        const codes = new Set();
        const subjects = new Map();
        const yearLevels = new Map();
        for (const item of validItems) {
            if (item) {
                // Collect curriculum info
                if (Array.isArray(item.curriculum_links)) {
                    for (const link of item.curriculum_links) {
                        if (link.topic)
                            topics.add(link.topic);
                        if (link.code)
                            codes.add(link.code);
                    }
                }
                else if (item.curriculum_link) { // Fallback for legacy items
                    if (item.curriculum_link.topic)
                        topics.add(item.curriculum_link.topic);
                    if (item.curriculum_link.code)
                        codes.add(item.curriculum_link.code);
                }
                // Count subjects to find plurality
                if (item.subject) {
                    subjects.set(item.subject, (subjects.get(item.subject) || 0) + 1);
                }
                // Count year levels
                if (item.year_level) {
                    yearLevels.set(item.year_level, (yearLevels.get(item.year_level) || 0) + 1);
                }
            }
        }
        // Determine Primary Subject
        let primarySubject = data.subject;
        if (!primarySubject && subjects.size > 0) {
            primarySubject = Array.from(subjects.entries())
                .sort((a, b) => b[1] - a[1])[0][0];
        }
        if (!primarySubject)
            primarySubject = 'General';
        // Determine Year Level
        let primaryYear = 'Year 5';
        if (yearLevels.size > 0) {
            primaryYear = Array.from(yearLevels.entries())
                .sort((a, b) => b[1] - a[1])[0][0];
        }
        const topicList = Array.from(topics).join(', ');
        const codeList = Array.from(codes).join(', ');
        // 3. Construct Logic based on Mode
        const jobRef = db.collection('generationJobs').doc();
        let jobData = {};
        if (mode === 'revision') {
            // REVISION MODE: Targeted 1-to-1 quiz via 'revision_quiz' worker
            const distinctTopic = `Revision Quest: ${topicList || primarySubject} (${codeList || 'Targeted Practice'})`;
            // We pass the full items so the worker can generate 1-to-1 questions
            jobData = {
                userId: uid,
                type: 'revision_quiz', // Triggers fetchRevisionQuizJobResponse
                status: 'queued',
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                input: {
                    topic: distinctTopic,
                    subject: primarySubject,
                    yearLevel: primaryYear,
                    difficulty: 'intermediate',
                    numQuestions: validItems.length, // 1 question per item
                    knowledgeItems: validItems // PASS FULL ITEMS
                },
                source: 'forge_quest_revision',
                knowledgeItemIds: knowledgeItemIds
            };
        }
        else {
            // MASTERY MODE: Expansion Course
            const distinctTopic = `Mastery Quest: ${topicList || primarySubject} (${codeList || 'Advanced Concepts'}). Expand on these concepts with advanced challenges.`;
            jobData = {
                userId: uid,
                type: 'course', // Triggers processCourseJob
                status: 'queued',
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                input: {
                    topic: distinctTopic,
                    subject: primarySubject,
                    gradeLevel: primaryYear,
                    difficulty: 'advanced',
                    slideCount: 3,
                    numQuestions: 5
                },
                source: 'forge_quest_mastery',
                knowledgeItemIds: knowledgeItemIds // SAVE LINK FOR MASTERY TRACKING
            };
        }
        await jobRef.set(jobData);
        console.log(`[ForgeQuest] Created Job ${jobRef.id} (Type: ${jobData.type})`);
        return {
            success: true,
            jobId: jobRef.id,
            message: 'Quest generation started'
        };
    }
    catch (error) {
        console.error('[ForgeQuest] Error:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});
