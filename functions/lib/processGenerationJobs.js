"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processGenerationJobs = void 0;
const v2_1 = require("firebase-functions/v2");
const firestore_1 = require("firebase-functions/v2/firestore");
const firebase_admin_1 = __importDefault(require("firebase-admin"));
// Initialize Firebase Admin (idempotent, shared across functions)
if (!firebase_admin_1.default.apps?.length) {
    firebase_admin_1.default.initializeApp();
}
const db = firebase_admin_1.default.firestore();
/**
 * Firestore trigger:
 *  - Watches generationJobs/{jobId} updates
 *  - Handles 'revision_quiz' (standalone) AND 'section-quiz' (part of course)
 *  - When status transitions to 'fetched':
 *    - Parses questions from rawContent
 *    - Writes questions to the appropriate subcollection
 *    - Updates stats
 */
exports.processGenerationJobs = (0, firestore_1.onDocumentUpdated)({
    document: 'generationJobs/{jobId}',
    region: 'australia-southeast1',
    timeoutSeconds: 540,
}, async (event) => {
    const before = event.data?.before;
    const after = event.data?.after;
    const jobId = event.params.jobId;
    if (!before || !after)
        return;
    const beforeData = before.data();
    const afterData = after.data();
    if (!beforeData || !afterData)
        return;
    // Filter for supported types
    const supportedTypes = ['revision_quiz', 'section-quiz'];
    if (!supportedTypes.includes(afterData.type))
        return;
    // Only act on transition to fetched
    if (beforeData.status === afterData.status || afterData.status !== 'fetched')
        return;
    // Idempotency check
    v2_1.logger.info(`[processGenerationJobs] Processing fetched ${afterData.type} job:`, jobId);
    const rawContent = afterData.rawContent;
    if (!rawContent || typeof rawContent !== 'string') {
        await after.ref.update({
            status: 'failed',
            error: 'Missing rawContent for quiz processing.',
            updatedAt: new Date(),
            completedAt: new Date(),
        });
        return;
    }
    let parsed;
    try {
        parsed = tolerantJsonParse(rawContent);
    }
    catch (e) {
        v2_1.logger.error('Failed to parse JSON:', e);
        await after.ref.update({
            status: 'failed',
            error: 'rawContent is not valid JSON.',
            updatedAt: new Date(),
            completedAt: new Date(),
        });
        return;
    }
    const userId = afterData.userId;
    const input = afterData.input || {};
    const topic = input.topic || 'Generated Quiz';
    // Extract questions array
    const questions = Array.isArray(parsed?.questions)
        ? parsed.questions
        : Array.isArray(parsed)
            ? parsed
            : [];
    if (questions.length === 0) {
        await after.ref.update({
            status: 'failed',
            error: 'No questions found in AI response.',
            updatedAt: new Date(),
            completedAt: new Date(),
        });
        return;
    }
    v2_1.logger.info(`[processGenerationJobs] Found ${questions.length} questions.`);
    const now = new Date();
    let courseId = '';
    let sectionId = '';
    let studyAidId = ''; // Only for standalone quizzes
    // BRANCH 1: Section Quiz (Existing Course/Section)
    if (afterData.type === 'section-quiz') {
        if (!input.courseId || !input.sectionId) {
            v2_1.logger.error('Missing courseId or sectionId for section-quiz');
            await after.ref.update({ status: 'failed', error: 'Missing target section context' });
            return;
        }
        courseId = input.courseId;
        sectionId = input.sectionId;
        v2_1.logger.info(`[processGenerationJobs] Targeting existing section: ${sectionId} in course: ${courseId}`);
    }
    // BRANCH 2: Standalone Revision Quiz (Create Wrapper)
    else {
        // Use AI-generated title/desc if available, fallback to topic
        const title = parsed.title || `Revision Quiz: ${topic}`;
        const description = parsed.description || `AI-generated revision quiz for topic "${topic}".`;
        // Create Course Wrapper
        const courseRef = db.collection('courses').doc();
        courseId = courseRef.id;
        await courseRef.set({
            id: courseId,
            title,
            description,
            creatorId: userId,
            sharing: 'private',
            sectionCount: 1,
            questionCount: questions.length,
            aiGenerated: true,
            aiModel: input.model || 'openrouter',
            createdAt: now,
            updatedAt: now,
            theme: {
                primaryColor: '#1f2933',
                secondaryColor: '#4b5563',
                backgroundStyle: 'parchment'
            },
            type: 'quiz' // Explicitly mark as quiz course
        });
        // Create Section Wrapper
        const sectionRef = courseRef.collection('sections').doc();
        sectionId = sectionRef.id;
        await sectionRef.set({
            id: sectionId,
            courseId,
            title: 'Quiz Questions',
            description: `Questions for ${topic}`,
            order: 0,
            contentType: 'quiz', // Legacy marker
            contentKind: 'quiz',
            questionCount: questions.length,
            deepDive: parsed.deepDive || null, // <--- Save Deep Dive Content
            createdAt: now,
            updatedAt: now
        });
        // Create StudyAid
        const studyAidRef = db.collection('studyAids').doc();
        studyAidId = studyAidRef.id;
        await studyAidRef.set({
            id: studyAidId,
            userId,
            type: 'quiz',
            title,
            description,
            courseId,
            sectionId,
            status: 'ready',
            generatedBy: 'ai',
            createdAt: now,
            updatedAt: now
        });
    }
    // WRITE QUESTIONS to subcollection
    const sectionRef = db.collection('courses').doc(courseId).collection('sections').doc(sectionId);
    let createdQuestions = 0;
    const batch = db.batch();
    // process in chunks if many questions, but usually small (<20)
    for (let qIndex = 0; qIndex < questions.length; qIndex++) {
        const q = questions[qIndex] || {};
        const questionRef = sectionRef.collection('questions').doc();
        // Normalize question type
        let qType = q.type || 'multiple-choice';
        if (qType === 'mcq' || qType === 'multiple_choice')
            qType = 'multiple-choice';
        if (qType === 'tf' || qType === 'true_false')
            qType = 'true-false';
        if (qType === 'sa' || qType === 'short_answer')
            qType = 'short-answer';
        const options = Array.isArray(q.options) && q.options.length > 0 ? q.options : null;
        const questionDoc = {
            id: questionRef.id,
            sectionId: sectionId, // Important linkage
            text: q.text || q.question || `Question ${qIndex + 1}`,
            type: qType,
            options: options,
            correctAnswer: q.correctAnswer ?? q.correct_answer ?? q.answer ?? '',
            explanation: q.explanation || '',
            difficulty: mapDifficulty(input.difficulty),
            points: 1,
            aiGenerated: true,
            aiModel: input.model || 'openrouter',
            order: qIndex,
            createdAt: now,
            updatedAt: now,
            ...(q.source_item_id ? { sourceItemId: q.source_item_id } : {}) // Save linkage if present
        };
        batch.set(questionRef, questionDoc);
        createdQuestions++;
    }
    await batch.commit();
    v2_1.logger.info(`[processGenerationJobs] Wrote ${createdQuestions} questions.`);
    // UPDATE COUNTS (Atomically if possible)
    if (afterData.type === 'section-quiz') {
        // Increment Section count
        await sectionRef.update({
            questionCount: firebase_admin_1.default.firestore.FieldValue.increment(createdQuestions),
            updatedAt: now
        });
        // Increment Course count
        await db.collection('courses').doc(courseId).update({
            questionCount: firebase_admin_1.default.firestore.FieldValue.increment(createdQuestions),
            updatedAt: now
        });
    }
    // Complete Job
    const updatePayload = {
        status: 'completed',
        error: null,
        courseId,
        sectionId,
        questionsCreated: createdQuestions,
        updatedAt: now,
        completedAt: now
    };
    if (studyAidId)
        updatePayload.studyAidId = studyAidId;
    await after.ref.update(updatePayload);
    v2_1.logger.info('[processGenerationJobs] Job completed successfully.');
});
function tolerantJsonParse(raw) {
    let cleaned = raw.trim();
    if (cleaned.startsWith('```json'))
        cleaned = cleaned.slice(7);
    else if (cleaned.startsWith('```'))
        cleaned = cleaned.slice(3);
    if (cleaned.endsWith('```'))
        cleaned = cleaned.slice(0, -3);
    cleaned = cleaned.replace(/^`+|`+$/g, '').trim();
    try {
        return JSON.parse(cleaned);
    }
    catch {
        const objectMatch = cleaned.match(/\{[\s\S]*\}/);
        if (objectMatch) {
            try {
                return JSON.parse(objectMatch[0]);
            }
            catch { }
        }
        const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
        if (arrayMatch) {
            try {
                return JSON.parse(arrayMatch[0]);
            }
            catch { }
        }
        throw new Error('Could not extract valid JSON from response');
    }
}
function mapDifficulty(difficulty) {
    switch (difficulty) {
        case 'beginner': return 'easy';
        case 'intermediate': return 'medium';
        case 'advanced': return 'hard';
        default: return 'easy';
    }
}
