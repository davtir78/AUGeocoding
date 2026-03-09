
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import { analyzeArtifact, UploadData } from './analyzer';

if (!admin.apps?.length) {
    admin.initializeApp();
}

export const processArtifactJob = onDocumentCreated(
    {
        document: 'generationJobs/{jobId}',
        region: 'australia-southeast1',
        timeoutSeconds: 300,
        memory: '2GiB',
        secrets: ['OPENROUTER_API_KEY']
    },
    async (event) => {
        const snapshot = event.data;
        if (!snapshot) return;

        const data = snapshot.data();
        if (data.type !== 'artifact') return; // Ignore other job types
        if (data.status !== 'queued') return; // Only pick up queued jobs

        const jobId = event.params.jobId;
        logger.info(`[processArtifactJob] Processing job ${jobId}`);

        try {
            // Update status to processing
            await snapshot.ref.update({
                status: 'processing',
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            const input = data.input as UploadData;

            // Run Analysis
            const result = await analyzeArtifact(data.userId, input);

            // Mark completed or needs clarification
            const finalStatus = result.status === 'needs_clarification' ? 'needs_clarification' : 'completed';

            await snapshot.ref.update({
                status: finalStatus,
                result: result,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                completedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            logger.info(`[processArtifactJob] Job ${jobId} finished with status: ${finalStatus}`);

        } catch (error: any) {
            logger.error(`[processArtifactJob] Job ${jobId} failed.`, error);

            // Check for transient errors to allow Retry
            const isTransient =
                error.code === 'ETIMEDOUT' ||
                error.code === 'ECONNRESET' ||
                (error.message && error.message.includes('rate limit'));

            if (isTransient) {
                logger.warn(`[processArtifactJob] Transient error detected. Rethrowing to trigger retry.`);
                throw error; // Cloud Functions will retry if configured
            }

            await snapshot.ref.update({
                status: 'failed',
                error: error.message || 'Unknown error',
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }
    }
);
