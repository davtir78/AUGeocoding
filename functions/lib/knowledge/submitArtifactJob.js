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
exports.submitArtifactJob = void 0;
const https_1 = require("firebase-functions/v2/https");
const firebase_functions_1 = require("firebase-functions");
const admin = __importStar(require("firebase-admin"));
if (!admin.apps?.length) {
    admin.initializeApp();
}
const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });
exports.submitArtifactJob = (0, https_1.onRequest)({
    region: 'australia-southeast1',
    cors: true,
    secrets: ['OPENROUTER_API_KEY'],
}, async (req, res) => {
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
    let uid;
    try {
        const idToken = authHeader.split('Bearer ')[1];
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        uid = decodedToken.uid;
    }
    catch (error) {
        firebase_functions_1.logger.error('[submitArtifactJob] Auth failed', error);
        res.status(401).json({ error: 'Invalid token' });
        return;
    }
    const body = req.body || {};
    const { fileUrl, type, sourceName, yearLevel, text } = body;
    firebase_functions_1.logger.info('[submitArtifactJob] Received request body', {
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
        const input = {
            type: type,
            sourceName: sourceName || '',
            yearLevel: yearLevel || '',
        };
        if (fileUrl)
            input.fileUrl = fileUrl;
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
        firebase_functions_1.logger.info('[submitArtifactJob] Final synthesized jobData', {
            userId: uid,
            type: jobData.type,
            inputKeys: Object.keys(jobData.input)
        });
        const jobRef = db.collection('generationJobs').doc();
        await jobRef.set(jobData);
        firebase_functions_1.logger.info(`[submitArtifactJob] Created job ${jobRef.id} for user ${uid}`);
        res.status(200).json({ jobId: jobRef.id, status: 'queued' });
    }
    catch (e) {
        firebase_functions_1.logger.error('[submitArtifactJob] Error creating job', {
            message: e?.message,
            stack: e?.stack
        });
        res.status(500).json({ error: 'Internal Server Error' });
    }
});
