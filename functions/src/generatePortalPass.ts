import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { GoogleAuth } from 'google-auth-library';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
    admin.initializeApp();
}

/**
 * generatePortalPass
 * 
 * Authenticates the user, checks for sufficient credits, and returns a 
 * short-lived Google Access Token for connecting to Vertex AI (Gemini).
 */
export const generatePortalPass = onCall(
    {
        region: 'australia-southeast1',
        cors: true,
    },
    async (request) => {
        // 1. Authenticate User
        if (!request.auth) {
            throw new HttpsError('unauthenticated', 'The user must be authenticated to enter the portal.');
        }

        const userId = request.auth.uid;

        // 2. Check Credits (Ink Drops)
        const userDoc = await admin.firestore().collection('userProfiles').doc(userId).get();

        if (!userDoc.exists) {
            throw new HttpsError('not-found', 'User profile not found.');
        }

        const userData = userDoc.data();
        const credits = userData?.credits || 0;

        if (credits <= 0) {
            throw new HttpsError('permission-denied', 'Not enough ink in the quill. Please acquire more credits.');
        }

        try {
            // 3. Generate Ephemeral Access Token
            // This uses the Application Default Credentials (ADC) of the Cloud Function Service Account.
            // The Service Account MUST have the "Vertex AI User" role.
            const auth = new GoogleAuth({
                scopes: ['https://www.googleapis.com/auth/cloud-platform']
            });

            const client = await auth.getClient();
            const accessToken = await client.getAccessToken();

            if (!accessToken.token) {
                throw new HttpsError('internal', 'Failed to grant portal access.');
            }

            // 4. Return Token and Session Metadata
            return {
                token: accessToken.token,
                sessionId: `sess_${userId}_${Date.now()}`,
                expiresIn: 3600 // roughly 1 hour
            };
        } catch (error) {
            console.error('Error generating access token:', error);
            throw new HttpsError('internal', 'The magical portal is currently closed. Please try again later.');
        }
    }
);
