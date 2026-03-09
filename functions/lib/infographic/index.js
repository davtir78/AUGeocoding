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
exports.processInfographicJob = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const firebase_functions_1 = require("firebase-functions");
const admin = __importStar(require("firebase-admin"));
const generateInfographic_1 = require("./generateInfographic");
if (!admin.apps?.length) {
    admin.initializeApp();
}
/**
 * Triggered when a Generation Job is created/updated.
 * Filters for type === 'infographic'.
 */
exports.processInfographicJob = (0, firestore_1.onDocumentWritten)({
    document: 'generationJobs/{jobId}',
    region: 'australia-southeast1',
    timeoutSeconds: 300, // 5 minutes usually enough for 1 image
    memory: '512MiB',
    secrets: ['OPENROUTER_API_KEY', 'OPENAI_API_KEY'],
}, async (event) => {
    const afterData = event.data?.after?.data();
    const beforeData = event.data?.before?.data();
    const jobId = event.params.jobId;
    if (!afterData)
        return; // Deleted
    // Filter: Only process 'infographic' jobs in 'queued' state
    if (afterData.type !== 'infographic')
        return;
    if (afterData.status !== 'queued')
        return;
    // Dedup: If it was already queued/processing before, skip? 
    // Actually, trigger is on write. If verified status change to queued (e.g. from creation), run.
    if (beforeData?.status === 'processing' || beforeData?.status === 'completed')
        return;
    firebase_functions_1.logger.info(`[InfographicJob] Processing job ${jobId}`);
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
        const { imageUrl, attemptLog, visualDescription, deepDive, generationPrompt } = await (0, generateInfographic_1.generateInfographic)(topic, sourceText || "No specific data provided.", style || "Clean & Modern", preferredModels ?? preferredModel, // Pass the entire string[]
        ageGroup);
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
        firebase_functions_1.logger.info('[InfographicJob] Updating job with payload:', JSON.stringify(updatePayload)); // Debug log
        await event.data?.after.ref.update(updatePayload);
        firebase_functions_1.logger.info(`[InfographicJob] Completed job ${jobId}`);
    }
    catch (e) {
        firebase_functions_1.logger.error(`[InfographicJob] Failed job ${jobId}`, e);
        // Extract debugLog if it was attached to the error (from cumulative failure)
        const debugLog = e.attemptLog || [];
        await event.data?.after.ref.update({
            status: 'failed',
            error: e.message || "Unknown error",
            debugLog: debugLog, // Persist failure history
            completedAt: new Date()
        });
    }
});
