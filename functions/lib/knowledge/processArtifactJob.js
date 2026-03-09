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
exports.processArtifactJob = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const firebase_functions_1 = require("firebase-functions");
const admin = __importStar(require("firebase-admin"));
const analyzer_1 = require("./analyzer");
if (!admin.apps?.length) {
    admin.initializeApp();
}
exports.processArtifactJob = (0, firestore_1.onDocumentCreated)({
    document: 'generationJobs/{jobId}',
    region: 'australia-southeast1',
    timeoutSeconds: 300,
    memory: '2GiB',
    secrets: ['OPENROUTER_API_KEY']
}, async (event) => {
    const snapshot = event.data;
    if (!snapshot)
        return;
    const data = snapshot.data();
    if (data.type !== 'artifact')
        return; // Ignore other job types
    if (data.status !== 'queued')
        return; // Only pick up queued jobs
    const jobId = event.params.jobId;
    firebase_functions_1.logger.info(`[processArtifactJob] Processing job ${jobId}`);
    try {
        // Update status to processing
        await snapshot.ref.update({
            status: 'processing',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        const input = data.input;
        // Run Analysis
        const result = await (0, analyzer_1.analyzeArtifact)(data.userId, input);
        // Mark completed or needs clarification
        const finalStatus = result.status === 'needs_clarification' ? 'needs_clarification' : 'completed';
        await snapshot.ref.update({
            status: finalStatus,
            result: result,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            completedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        firebase_functions_1.logger.info(`[processArtifactJob] Job ${jobId} finished with status: ${finalStatus}`);
    }
    catch (error) {
        firebase_functions_1.logger.error(`[processArtifactJob] Job ${jobId} failed.`, error);
        // Check for transient errors to allow Retry
        const isTransient = error.code === 'ETIMEDOUT' ||
            error.code === 'ECONNRESET' ||
            (error.message && error.message.includes('rate limit'));
        if (isTransient) {
            firebase_functions_1.logger.warn(`[processArtifactJob] Transient error detected. Rethrowing to trigger retry.`);
            throw error; // Cloud Functions will retry if configured
        }
        await snapshot.ref.update({
            status: 'failed',
            error: error.message || 'Unknown error',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
    }
});
