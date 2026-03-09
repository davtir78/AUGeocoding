"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.dispatchPresentationJob = void 0;
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
 *  - Watches generationJobs/{jobId} documents
 *  - When a new job of type 'presentation' with status 'queued' is created:
 *    - Creates a corresponding 'presentations' document to start the legacy pipeline.
 *    - Updates the job status to 'processing' and links the presentationId.
 */
exports.dispatchPresentationJob = (0, firestore_1.onDocumentCreated)({
    document: 'generationJobs/{jobId}',
    region: 'australia-southeast1',
    timeoutSeconds: 60,
}, async (event) => {
    const snapshot = event.data;
    const jobId = event.params.jobId;
    if (!snapshot) {
        v2_1.logger.error('[dispatchPresentationJob] No snapshot provided for job:', jobId);
        return;
    }
    const job = snapshot.data();
    if (!job) {
        v2_1.logger.error('[dispatchPresentationJob] Job data missing for job:', jobId);
        return;
    }
    if (job.type !== 'presentation') {
        return;
    }
    v2_1.logger.info('[dispatchPresentationJob] Triggered for presentation job:', jobId);
    if (job.status !== 'queued') {
        v2_1.logger.info('[dispatchPresentationJob] Skipping job (status not queued):', jobId, job.status);
        return;
    }
    const { title, slideCount, theme, topic, version } = job.input || {};
    // Use title or topic as title fallback
    const presentationTitle = title || topic || 'Untitled Presentation';
    if (!slideCount || !theme) {
        v2_1.logger.error('[dispatchPresentationJob] Missing slideCount or theme for presentation job:', jobId);
        await snapshot.ref.update({
            status: 'failed',
            error: 'Missing slideCount or theme in job input.',
            updatedAt: new Date(),
        });
        return;
    }
    try {
        // Create presentation document to trigger existing pipeline
        const presentationRef = db.collection('presentations').doc();
        const presentationData = {
            userId: job.userId,
            title: presentationTitle,
            slideCount,
            theme,
            createdAt: new Date(),
            status: 'generating', // This triggers fetchPresentationResponse
            slides: [],
            generationJobId: jobId, // Link back to the job
            ...(topic ? { topic } : {}), // Pass topic if present
            ...(version ? { version } : {}), // Pass version if present
            ...(job.input?.preferredModels ? { preferredModels: job.input.preferredModels } : {}),
            ...(job.input?.ageGroup ? { ageGroup: job.input.ageGroup } : {}),
            ...(job.input?.language ? { language: job.input.language } : {}),
            ...(job.input?.tone ? { tone: job.input.tone } : {}),
            ...(job.input?.verbosity ? { verbosity: job.input.verbosity } : {}),
            ...(job.input?.instructions ? { instructions: job.input.instructions } : {}),
            ...(job.input?.additionalContext ? { additionalContext: job.input.additionalContext } : {}),
            ...(job.input?.autoGenerateAudio ? { autoGenerateAudio: job.input.autoGenerateAudio } : {}),
            ...(job.input?.voice ? { voice: job.input.voice } : {}),
        };
        await presentationRef.set(presentationData);
        v2_1.logger.info('[dispatchPresentationJob] Created presentation doc:', presentationRef.id);
        // Update job with link and status
        await snapshot.ref.update({
            status: 'processing', // or 'generating' if we want to match presentation status
            presentationId: presentationRef.id,
            updatedAt: new Date(),
        });
        v2_1.logger.info('[dispatchPresentationJob] Job updated to processing:', jobId);
    }
    catch (e) {
        v2_1.logger.error('[dispatchPresentationJob] Failed to dispatch presentation:', e);
        await snapshot.ref.update({
            status: 'failed',
            error: e.message || 'Failed to dispatch presentation job.',
            updatedAt: new Date(),
        });
    }
});
