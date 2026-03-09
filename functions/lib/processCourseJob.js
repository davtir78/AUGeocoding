"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processCourseJob = void 0;
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
 *  - When a 'course' job transitions to status 'fetched' (containing Outline JSON):
 *    - Creates Course Document
 *    - For each Section in Outline:
 *      * Creates a Presentation V2 Job (creates 'presentations' doc)
 *      * Creates a Section Quiz Job (creates 'generationJobs' doc with type 'section-quiz')
 *      * Creates Section Document linked to the above
 *    - Creates StudyAid
 *    - Marks job as completed
 */
exports.processCourseJob = (0, firestore_1.onDocumentUpdated)({
    document: 'generationJobs/{jobId}',
    region: 'australia-southeast1',
    timeoutSeconds: 540,
}, async (event) => {
    const before = event.data?.before;
    const after = event.data?.after;
    const jobId = event.params.jobId;
    if (!before || !after)
        return;
    try {
        const beforeData = before.data();
        const afterData = after.data();
        if (!beforeData || !afterData)
            return;
        if (afterData.type !== 'course')
            return;
        v2_1.logger.info(`[processCourseJob] Incoming change for ${jobId}: ${beforeData.status} -> ${afterData.status}`);
        // Only act on transition to fetched
        if (beforeData.status === afterData.status || afterData.status !== 'fetched')
            return;
        v2_1.logger.info('[processCourseJob] Processing fetched course job:', jobId);
        const rawContent = afterData.rawContent;
        if (!rawContent || typeof rawContent !== 'string') {
            await after.ref.update({
                status: 'failed',
                error: 'Missing rawContent for course processing.',
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
            v2_1.logger.error('[processCourseJob] Failed to parse rawContent JSON:', e);
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
        const title = parsed?.course?.title || input.topic || 'Generated Course';
        const description = parsed?.course?.description || input.topic || '';
        const sections = Array.isArray(parsed?.sections) ? parsed.sections : [];
        v2_1.logger.info('[processCourseJob] Parsed sections count:', sections.length);
        // Create course document
        const courseRef = db.collection('courses').doc();
        const now = new Date();
        const courseDoc = {
            id: courseRef.id,
            title,
            description,
            creatorId: userId,
            sharing: 'private',
            subject: input.subject || 'General',
            gradeLevel: input.gradeLevel ? [input.gradeLevel] : [],
            difficulty: input.difficulty || 'beginner',
            estimatedDuration: sections.length * 15, // rough estimate
            sectionCount: sections.length,
            questionCount: 0, // Will be updated as quizzes come in
            aiGenerated: true,
            aiModel: input.model || 'google/gemini-3-pro-preview',
            generationPrompt: input.topic || '',
            xpReward: 100,
            status: 'generating',
            createdAt: now,
            updatedAt: now,
            theme: {
                primaryColor: '#1f2933',
                secondaryColor: '#4b5563',
                backgroundStyle: 'parchment',
            },
            ...(afterData.knowledgeItemIds ? { knowledgeItemIds: afterData.knowledgeItemIds } : {}) // Link Vault items if present
        };
        await courseRef.set(courseDoc);
        v2_1.logger.info('[processCourseJob] Created course:', courseRef.id);
        // Process Sections
        for (let i = 0; i < sections.length; i++) {
            const sectionData = sections[i] || {};
            const sectionId = db.collection('courses').doc().id;
            const sectionRef = courseRef.collection('sections').doc(sectionId);
            const sectionTitle = sectionData.title || `Section ${i + 1}`;
            const sectionSummary = sectionData.summary || '';
            // 1. Kick off Presentation V2
            const presentationRef = db.collection('presentations').doc();
            const presentationDoc = {
                id: presentationRef.id,
                userId,
                title: sectionTitle,
                topic: `${sectionTitle}: ${sectionSummary}`,
                status: 'generating',
                version: 'v2',
                slideCount: input.slideCount || 5,
                theme: input.theme || 'modern',
                ageGroup: input.gradeLevel || 'mixed',
                additionalContext: `Part of course: ${title}`,
                createdAt: now,
                updatedAt: now,
                generationJobId: jobId,
                courseId: courseRef.id,
                sectionId: sectionId,
                // PASS THROUGH: Preferred models for presentation V2
                preferredModels: input.presentationModels || [],
                textModels: input.presentationTextModels || [],
                autoGenerateAudio: input.autoGenerateAudio || false,
                voice: input.audioVoice || 'alloy',
                visibility: 'hidden' // Hide from main dashboards
            };
            await presentationRef.set(presentationDoc);
            // 2. Kick off Section Quiz
            const quizJobRef = db.collection('generationJobs').doc();
            const quizJobDoc = {
                userId,
                type: 'section-quiz',
                status: 'queued',
                input: {
                    topic: sectionSummary,
                    subject: input.subject || 'General',
                    gradeLevel: input.gradeLevel || 'mixed',
                    difficulty: input.difficulty || 'beginner',
                    courseId: courseRef.id,
                    sectionId: sectionId,
                    numQuestions: input.numQuestions || 3,
                    // PASS THROUGH: Preferred models for section-quiz
                    preferredModels: input.quizModels || []
                },
                visibility: 'hidden', // Hide from main dashboards
                createdAt: now,
                updatedAt: now
            };
            await quizJobRef.set(quizJobDoc);
            // 3. Create Section
            const sectionDoc = {
                id: sectionId,
                courseId: courseRef.id,
                title: sectionTitle,
                description: sectionSummary,
                order: i,
                // New V2 fields
                presentationId: presentationRef.id,
                quizJobId: quizJobRef.id,
                // Legacy fields for compatibility
                contentType: 'presentation', // Changed from 'html'
                htmlContent: '',
                contentKind: 'presentation',
                learningObjectives: sectionData.learningObjectives || [],
                aiGenerated: true,
                questionCount: 0, // Starts at 0, quiz job will update this
                createdAt: now,
                updatedAt: now,
            };
            await sectionRef.set(sectionDoc);
            v2_1.logger.info(`[processCourseJob] Initialized Section ${i + 1}: ${sectionId} w/ Pres ${presentationRef.id} and QuizJob ${quizJobRef.id}`);
        }
        // Create StudyAid document
        const studyAidRef = db.collection('studyAids').doc();
        await studyAidRef.set({
            id: studyAidRef.id,
            userId,
            type: 'course',
            title,
            description,
            courseId: courseRef.id,
            status: 'generating',
            generatedBy: 'ai',
            createdAt: now,
            updatedAt: now,
        });
        // Complete the main job
        await after.ref.update({
            status: 'completed',
            courseId: courseRef.id,
            studyAidId: studyAidRef.id,
            updatedAt: new Date(),
            completedAt: new Date(),
        });
    }
    catch (err) {
        v2_1.logger.error('[processCourseJob] Unexpected error:', jobId, err);
        try {
            await after.ref.update({
                status: 'failed',
                error: err.message || 'Unexpected internal error.',
                updatedAt: new Date(),
                completedAt: new Date(),
            });
        }
        catch (innerErr) {
            v2_1.logger.error('[processCourseJob] Failed to set error status:', jobId, innerErr);
        }
    }
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
