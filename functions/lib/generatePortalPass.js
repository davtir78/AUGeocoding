"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.generatePortalPass = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const google_auth_library_1 = require("google-auth-library");
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
exports.generatePortalPass = (0, https_1.onCall)({
    region: 'australia-southeast1',
    cors: true,
}, async (request) => {
    // 1. Authenticate User
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'The user must be authenticated to enter the portal.');
    }
    const userId = request.auth.uid;
    // 2. Check Credits (Ink Drops)
    const userDoc = await admin.firestore().collection('userProfiles').doc(userId).get();
    if (!userDoc.exists) {
        throw new https_1.HttpsError('not-found', 'User profile not found.');
    }
    const userData = userDoc.data();
    const credits = userData?.credits || 0;
    if (credits <= 0) {
        throw new https_1.HttpsError('permission-denied', 'Not enough ink in the quill. Please acquire more credits.');
    }
    try {
        // 3. Generate Ephemeral Access Token
        // This uses the Application Default Credentials (ADC) of the Cloud Function Service Account.
        // The Service Account MUST have the "Vertex AI User" role.
        const auth = new google_auth_library_1.GoogleAuth({
            scopes: ['https://www.googleapis.com/auth/cloud-platform']
        });
        const client = await auth.getClient();
        const accessToken = await client.getAccessToken();
        if (!accessToken.token) {
            throw new https_1.HttpsError('internal', 'Failed to grant portal access.');
        }
        // 4. Return Token and Session Metadata
        return {
            token: accessToken.token,
            sessionId: `sess_${userId}_${Date.now()}`,
            expiresIn: 3600 // roughly 1 hour
        };
    }
    catch (error) {
        console.error('Error generating access token:', error);
        throw new https_1.HttpsError('internal', 'The magical portal is currently closed. Please try again later.');
    }
});
