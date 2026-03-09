import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

interface ForgeQuestData {
    knowledgeItemIds: string[];
    mode: 'revision' | 'mastery';
    subject?: string;
}

export const forgeQuest = functions.region('australia-southeast1')
    .runWith({
        timeoutSeconds: 60,
        memory: '512MB'
    })
    .https.onCall(async (data: ForgeQuestData, context) => {
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
            const topics = new Set<string>();
            const codes = new Set<string>();
            const subjects = new Map<string, number>();
            const yearLevels = new Map<string, number>();

            for (const item of validItems as any[]) {
                if (item) {
                    // Collect curriculum info
                    if (Array.isArray(item.curriculum_links)) {
                        for (const link of item.curriculum_links) {
                            if (link.topic) topics.add(link.topic);
                            if (link.code) codes.add(link.code);
                        }
                    } else if (item.curriculum_link) { // Fallback for legacy items
                        if (item.curriculum_link.topic) topics.add(item.curriculum_link.topic);
                        if (item.curriculum_link.code) codes.add(item.curriculum_link.code);
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
            if (!primarySubject) primarySubject = 'General';

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
            let jobData: any = {};

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

            } else {
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

        } catch (error: any) {
            console.error('[ForgeQuest] Error:', error);
            throw new functions.https.HttpsError('internal', error.message);
        }
    });
