
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';

if (!admin.apps?.length) {
    admin.initializeApp();
}
const db = admin.firestore();

/**
 * Triggered when a Presentation document is updated.
 * Checks if all presentations belonging to a Course are complete.
 * If so, marks the Course and StudyAid as 'ready'.
 */
export const syncCourseStatus = onDocumentUpdated(
    {
        document: 'presentations/{presentationId}',
        region: 'australia-southeast1',
        timeoutSeconds: 60,
    },
    async (event) => {
        const before = event.data?.before.data();
        const after = event.data?.after.data();
        const presentationId = event.params.presentationId;

        if (!before || !after) return;

        // Optimization: Only run if status changed
        if (before.status === after.status) return;

        // Only care if status is terminal (completed or failed)
        if (after.status !== 'completed' && after.status !== 'failed') return;

        const courseId = after.courseId;
        if (!courseId) return; // Presentation not part of a course

        logger.info(`[syncCourseStatus] Presentation ${presentationId} finished (${after.status}). Checking Course ${courseId}...`);

        // Check all sibling presentations
        const siblingsSnap = await db.collection('presentations')
            .where('courseId', '==', courseId)
            .get();

        if (siblingsSnap.empty) return;

        let allCompleted = true;
        let anyFailed = false;
        let pendingCount = 0;

        siblingsSnap.docs.forEach(doc => {
            const data = doc.data();
            if (data.status === 'failed') anyFailed = true;
            if (data.status !== 'completed') allCompleted = false;
            if (data.status === 'generating' || data.status === 'processing' || data.status === 'queued') {
                pendingCount++;
            }
        });

        logger.info(`[syncCourseStatus] Course ${courseId} stats: ${siblingsSnap.size} total, ${pendingCount} pending, Failed: ${anyFailed}, AllCompleted: ${allCompleted}`);

        const courseRef = db.collection('courses').doc(courseId);

        if (allCompleted) {
            // All Done -> READY
            logger.info(`[syncCourseStatus] Marking Course ${courseId} as READY.`);

            await courseRef.update({
                status: 'ready',
                updatedAt: new Date()
            });

            // Update StudyAid as well
            const studyAidSnap = await db.collection('studyAids').where('courseId', '==', courseId).limit(1).get();
            if (!studyAidSnap.empty) {
                await studyAidSnap.docs[0].ref.update({
                    status: 'ready',
                    updatedAt: new Date()
                });
            }

        } else if (anyFailed && pendingCount === 0) {
            // All processed, but some failed
            logger.warn(`[syncCourseStatus] Marking Course ${courseId} as FAILED (partial).`);

            await courseRef.update({
                status: 'error',
                error: 'Some sections failed to generate.',
                updatedAt: new Date()
            });

            // Update StudyAid as well
            const studyAidSnap = await db.collection('studyAids').where('courseId', '==', courseId).limit(1).get();
            if (!studyAidSnap.empty) {
                await studyAidSnap.docs[0].ref.update({
                    status: 'error',
                    updatedAt: new Date()
                });
            }
        }
        // Else: Still generating, do nothing (keep status 'generating')
    }
);
