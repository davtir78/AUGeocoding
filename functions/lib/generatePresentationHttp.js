"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generatePresentationHttp = void 0;
const https_1 = require("firebase-functions/v2/https");
const firebase_functions_1 = require("firebase-functions");
const firebase_admin_1 = __importDefault(require("firebase-admin"));
// Initialize Firebase Admin (idempotent)
if (!firebase_admin_1.default.apps?.length) {
    firebase_admin_1.default.initializeApp();
}
const db = firebase_admin_1.default.firestore();
exports.generatePresentationHttp = (0, https_1.onRequest)({
    region: 'australia-southeast1',
    cors: true,
    secrets: ['OPENROUTER_API_KEY']
}, async (req, res) => {
    // Handle OPTIONS pre-flight
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }
    // Only allow POST
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed. Use POST.' });
        return;
    }
    firebase_functions_1.logger.info('[DEBUG] generatePresentationHttp called');
    firebase_functions_1.logger.info('[DEBUG] Request body:', req.body);
    firebase_functions_1.logger.info('[DEBUG] Authorization header:', req.headers.authorization);
    // Verify Firebase ID token
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        firebase_functions_1.logger.error('[DEBUG] Missing or invalid authorization header');
        res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
        return;
    }
    let uid;
    try {
        const idToken = authHeader.split('Bearer ')[1];
        const decodedToken = await firebase_admin_1.default.auth().verifyIdToken(idToken);
        uid = decodedToken.uid;
        firebase_functions_1.logger.info('[DEBUG] Successfully verified token for user:', uid);
    }
    catch (error) {
        firebase_functions_1.logger.error('[DEBUG] Token verification failed:', error);
        res.status(401).json({ error: 'Unauthorized: Invalid token' });
        return;
    }
    // Parse request body
    const { title, slideCount, theme } = req.body || {};
    firebase_functions_1.logger.info('[DEBUG] Parsed data:', { title, slideCount, theme });
    // Validation
    if (!title || typeof slideCount !== 'number' || slideCount < 1 || slideCount > 20 || !theme) {
        firebase_functions_1.logger.error('[DEBUG] Validation failed:', {
            hasTitle: !!title,
            slideCountType: typeof slideCount,
            slideCountValue: slideCount,
            hasTheme: !!theme
        });
        res.status(400).json({
            error: 'Invalid input: title, slideCount (1-20), and theme are required.'
        });
        return;
    }
    firebase_functions_1.logger.info('[DEBUG] Validation passed, creating presentation document');
    // Create presentation document with 'generating' status and return immediately
    const presentationRef = db.collection('presentations').doc();
    const presentationData = {
        userId: uid,
        title,
        slideCount,
        theme,
        createdAt: new Date(),
        status: 'generating',
        slides: [],
    };
    firebase_functions_1.logger.info('[DEBUG] Presentation data to save:', presentationData);
    await presentationRef.set(presentationData);
    firebase_functions_1.logger.info(`[DEBUG] Created presentation ${presentationRef.id} for user ${uid} - background processing will start`);
    // Return immediately - background trigger will handle the AI generation
    const result = { id: presentationRef.id };
    firebase_functions_1.logger.info('[DEBUG] Returning result:', result);
    res.json(result);
});
