
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';

if (!admin.apps?.length) {
    admin.initializeApp();
}
const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

export const submitArtifactJob = onRequest(
    {
        region: 'australia-southeast1',
        cors: true,
        secrets: ['OPENROUTER_API_KEY'],
    },
    async (req, res) => {
        if (req.method === 'OPTIONS') {
            res.status(204).send('');
            return;
        }

        if (req.method !== 'POST') {
            res.status(405).json({ error: 'Method not allowed. Use POST.' });
            return;
        }

        // Verify Auth
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        let uid: string;
        try {
            const idToken = authHeader.split('Bearer ')[1];
            const decodedToken = await admin.auth().verifyIdToken(idToken);
            uid = decodedToken.uid;
        } catch (error) {
            logger.error('[submitArtifactJob] Auth failed', error);
            res.status(401).json({ error: 'Invalid token' });
            return;
        }

        const body = req.body || {};
        const { fileUrl, type, sourceName, yearLevel, text } = body;

        logger.info('[submitArtifactJob] Received request body', {
            hasFile: !!fileUrl,
            type,
            sourceName,
            yearLevel,
            hasText: !!text
        });

        if ((!fileUrl && !text) || !type) {
            res.status(400).json({ error: 'Missing required fields (fileUrl OR text, type).' });
            return;
        }

        try {
            const now = admin.firestore.FieldValue.serverTimestamp();

            // Defensively build the input object to avoid ANY undefined fields
            const input: any = {
                type: type,
                sourceName: sourceName || '',
                yearLevel: yearLevel || '',
            };

            if (fileUrl) input.fileUrl = fileUrl;
            if (typeof text === 'string' && text.trim().length > 0) {
                input.text = text.trim();
            }

            const jobData = {
                userId: uid,
                type: 'artifact',
                status: 'queued',
                input,
                createdAt: now,
                updatedAt: now
            };

            logger.info('[submitArtifactJob] Final synthesized jobData', {
                userId: uid,
                type: jobData.type,
                inputKeys: Object.keys(jobData.input)
            });

            const jobRef = db.collection('generationJobs').doc();
            await jobRef.set(jobData);

            logger.info(`[submitArtifactJob] Created job ${jobRef.id} for user ${uid}`);
            res.status(200).json({ jobId: jobRef.id, status: 'queued' });

        } catch (e: any) {
            logger.error('[submitArtifactJob] Error creating job', {
                message: e?.message,
                stack: e?.stack
            });
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }
);
