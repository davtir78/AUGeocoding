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
exports.analyzeArtifact = analyzeArtifact;
const admin = __importStar(require("firebase-admin"));
const firebase_functions_1 = require("firebase-functions");
const scout_1 = require("./scout");
const scribe_1 = require("./scribe");
const librarian_1 = require("./librarian");
const architect_1 = require("./architect");
async function analyzeArtifact(uid, data) {
    const db = admin.firestore();
    const { fileUrl, sourceName, yearLevel, text: userHint } = data;
    firebase_functions_1.logger.info(`[Analyzer] Starting 4-Stage Pipeline for ${sourceName} (${uid})`);
    // Initialize Clients
    const scout = new scout_1.ScoutClient();
    const scribe = new scribe_1.ScribeClient();
    const librarian = new librarian_1.LibrarianClient();
    const architect = new architect_1.ArchitectClient();
    try {
        // --- BRANCH: TEXT-ONLY MODE ---
        if ((!fileUrl || fileUrl.trim() === '') && userHint) {
            firebase_functions_1.logger.info(`[Analyzer] Text-only mode detected.`);
            // Treat the user text as "transcribed text"
            const scribeItem = {
                region_id: 'full_text',
                transcribed_text: userHint,
                text_type: 'printed',
                confidence: 1.0
            };
            // Stage 3 & 4 (Unified Logic)
            const enrichment = await librarian.enrichContext(uid, scribeItem.transcribed_text);
            const metadata = { subject: 'General', year: yearLevel || 'Unknown', sourceName };
            const item = await architect.constructKnowledgeItem(scribeItem, metadata, { standards: enrichment.standards, duplicates: enrichment.duplicates });
            if (item) {
                // Check if Architect requested clarification
                if (item.extraction_status === 'needs_clarification') {
                    return {
                        success: true,
                        count: 0,
                        status: 'needs_clarification',
                        clarificationQuestion: item.clarification_question || 'Could not understand text.',
                        inferredSubject: 'General'
                    };
                }
                item.uid = uid;
                const docRef = db.collection('knowledge_items').doc();
                item.id = docRef.id;
                await docRef.set(item);
                return {
                    success: true,
                    count: 1,
                    inferredSubject: item.subject,
                    status: 'success'
                };
            }
            // Fallback if architect returns null (should imply failure)
            return { success: false, count: 0, status: 'failed', inferredSubject: 'General', error: 'Architect failed to structure text' };
        }
        // --- STAGE 1: THE SCOUT ---
        const { result: scoutResult, safeImageUrl } = await scout.detectLayoutAndPII(fileUrl, userHint);
        // Handle Answer Keys / Reference Docs
        if (scoutResult.artifact_type === 'answer_key' || scoutResult.artifact_type === 'textbook_page') {
            firebase_functions_1.logger.info(`[Analyzer] Detected ${scoutResult.artifact_type}. Storing as Reference Image.`);
            const refDoc = {
                uid,
                source_name: sourceName,
                document_type: scoutResult.artifact_type === 'answer_key' ? 'answer_key' : 'instruction',
                image_url: safeImageUrl, // Use the PII-scrubbed URL
                page_number: 1, // Default for single image upload
                created_at: admin.firestore.Timestamp.now()
            };
            await db.collection('reference_images').add(refDoc);
            return { success: true, count: 0, inferredSubject: scoutResult.suggested_subject, status: 'success' };
        }
        // --- STAGE 2: THE SCRIBE ---
        const scribePromises = scoutResult.regions.map(async (region) => {
            // If it's an image-only region (diagram), we might skip transcription or just describe it.
            // For now, we try to transcribe everything.
            return await scribe.transcribeRegion(safeImageUrl, region.bbox, region.brief_desc);
        });
        const scribeResults = await Promise.all(scribePromises);
        // --- STAGE 3 & 4: LIBRARIAN & ARCHITECT ---
        const knowledgeItems = [];
        for (const scribeItem of scribeResults) {
            if (!scribeItem.transcribed_text)
                continue;
            // Stage 3: Librarian (Enrichment)
            // We use the transcribed text to find standards and duplicates
            const enrichment = await librarian.enrichContext(uid, scribeItem.transcribed_text);
            if (enrichment.isDuplicate) {
                firebase_functions_1.logger.info(`[Analyzer] Skipping duplicate item (sim: ${enrichment.duplicates[0].similarity})`);
                continue;
            }
            // Stage 4: Architect (Structure & Solve)
            const metadata = {
                subject: scoutResult.suggested_subject || 'General',
                year: scoutResult.suggested_year || yearLevel || 'Unknown',
                sourceName
            };
            const item = await architect.constructKnowledgeItem(scribeItem, metadata, { standards: enrichment.standards, duplicates: enrichment.duplicates });
            if (item) {
                item.uid = uid; // Ensure UID is set
                item.source_image_url = safeImageUrl; // Link to safe image
                item.reference_material_embedding = enrichment.embedding; // Store vector for future grouping
                knowledgeItems.push(item);
            }
        }
        // Batch Write
        if (knowledgeItems.length > 0) {
            const batch = db.batch();
            const collection = db.collection('knowledge_items');
            knowledgeItems.forEach(item => {
                const docRef = collection.doc();
                item.id = docRef.id;
                batch.set(docRef, item);
            });
            await batch.commit();
            firebase_functions_1.logger.info(`[Analyzer] Successfully committed ${knowledgeItems.length} items.`);
        }
        return {
            success: true,
            count: knowledgeItems.length,
            inferredSubject: scoutResult.suggested_subject,
            status: knowledgeItems.length > 0 ? 'success' : 'failed'
        };
    }
    catch (error) {
        if (error.message && error.message.includes('SAFETY_BLOCK')) {
            firebase_functions_1.logger.warn(`[Analyzer] Pipeline blocked by safety filter: ${error.message}`);
            return {
                success: false,
                count: 0,
                inferredSubject: 'Unknown',
                status: 'failed',
                error: 'Content Blocked by Safety Policy'
            };
        }
        firebase_functions_1.logger.error('[Analyzer] Pipeline failed', error);
        return {
            success: false,
            count: 0,
            inferredSubject: 'Unknown',
            status: 'failed',
            error: error.message
        };
    }
}
