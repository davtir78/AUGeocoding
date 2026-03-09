
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import { generateInfographic } from './generateInfographic';

if (!admin.apps?.length) {
    admin.initializeApp();
}

/**
 * Triggered when a Generation Job is created/updated.
 * Filters for type === 'infographic'.
 */
export const processInfographicJob = onDocumentWritten(
    {
        document: 'generationJobs/{jobId}',
        region: 'australia-southeast1',
        timeoutSeconds: 300, // 5 minutes usually enough for 1 image
        memory: '512MiB',
        secrets: ['OPENROUTER_API_KEY', 'OPENAI_API_KEY'],
    },
    async (event) => {
        const afterData = event.data?.after?.data();
        const beforeData = event.data?.before?.data();
        const jobId = event.params.jobId;

        if (!afterData) return; // Deleted

        // Filter: Only process 'infographic' jobs in 'queued' state
        if (afterData.type !== 'infographic') return;
        if (afterData.status !== 'queued') return;

        // Dedup: If it was already queued/processing before, skip? 
        // Actually, trigger is on write. If verified status change to queued (e.g. from creation), run.
        if (beforeData?.status === 'processing' || beforeData?.status === 'completed') return;

        logger.info(`[InfographicJob] Processing job ${jobId}`);

        try {
            // Update status to processing
            await event.data?.after.ref.update({
                status: 'processing',
                startedAt: new Date()
            });

            // Note: generateStudyAidJobHttp stores fields in 'input' object
            const { topic, sourceText, style, preferredModel, preferredModels, ageGroup } = afterData.input || {};

            if (!topic) {
                throw new Error("Missing 'topic' in job input.");
            }

            // Generate
            const { imageUrl, attemptLog, visualDescription, deepDive, generationPrompt } = await generateInfographic(
                topic,
                sourceText || "No specific data provided.",
                style || "Clean & Modern",
                preferredModels ?? preferredModel, // Pass the entire string[]
                ageGroup
            );

            if (!imageUrl) {
                throw new Error("Failed to generate image (no URL returned).");
            }

            // Update Job with Result
            const updatePayload = {
                status: 'completed',
                imageUrl: imageUrl,
                visualDescription: visualDescription ?? null, // Nullish coalescing
                deepDive: deepDive ?? null,
                generationPrompt: generationPrompt ?? null,
                debugLog: attemptLog,
                completedAt: new Date()
            };

            logger.info('[InfographicJob] Updating job with payload:', JSON.stringify(updatePayload)); // Debug log

            await event.data?.after.ref.update(updatePayload);

            logger.info(`[InfographicJob] Completed job ${jobId}`);

        } catch (e: any) {
            logger.error(`[InfographicJob] Failed job ${jobId}`, e);

            // Extract debugLog if it was attached to the error (from cumulative failure)
            const debugLog = e.attemptLog || [];

            await event.data?.after.ref.update({
                status: 'failed',
                error: e.message || "Unknown error",
                debugLog: debugLog, // Persist failure history
                completedAt: new Date()
            });
        }
    }
);
