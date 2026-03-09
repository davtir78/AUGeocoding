import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';
import { ScoutClient } from './scout';
import { ScribeClient } from './scribe';
import { LibrarianClient } from './librarian';
import { ArchitectClient } from './architect';
import { KnowledgeItem, ReferenceImage } from './schemas';

export interface UploadData {
    fileUrl: string;
    type: string;
    sourceName: string;
    yearLevel?: string;
    text?: string; // Optional user context/hint
}

export interface AnalysisResult {
    success: boolean;
    count: number;
    inferredSubject: string;
    status?: 'success' | 'needs_clarification' | 'failed' | 'partial_success';
    clarificationQuestion?: string;
    error?: string;
}

export async function analyzeArtifact(uid: string, data: UploadData): Promise<AnalysisResult> {
    const db = admin.firestore();
    const { fileUrl, sourceName, yearLevel, text: userHint } = data;

    logger.info(`[Analyzer] Starting 4-Stage Pipeline for ${sourceName} (${uid})`);

    // Initialize Clients
    const scout = new ScoutClient();
    const scribe = new ScribeClient();
    const librarian = new LibrarianClient();
    const architect = new ArchitectClient();

    try {
        // --- BRANCH: TEXT-ONLY MODE ---
        if ((!fileUrl || fileUrl.trim() === '') && userHint) {
            logger.info(`[Analyzer] Text-only mode detected.`);

            // Treat the user text as "transcribed text"
            const scribeItem = {
                region_id: 'full_text',
                transcribed_text: userHint,
                text_type: 'printed' as const,
                confidence: 1.0
            };

            // Stage 3 & 4 (Unified Logic)
            const enrichment = await librarian.enrichContext(uid, scribeItem.transcribed_text);
            const metadata = { subject: 'General', year: yearLevel || 'Unknown', sourceName };

            const item = await architect.constructKnowledgeItem(
                scribeItem,
                metadata,
                { standards: enrichment.standards, duplicates: enrichment.duplicates }
            );

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
            logger.info(`[Analyzer] Detected ${scoutResult.artifact_type}. Storing as Reference Image.`);

            const refDoc: ReferenceImage = {
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
        const knowledgeItems: KnowledgeItem[] = [];

        for (const scribeItem of scribeResults) {
            if (!scribeItem.transcribed_text) continue;

            // Stage 3: Librarian (Enrichment)
            // We use the transcribed text to find standards and duplicates
            const enrichment = await librarian.enrichContext(uid, scribeItem.transcribed_text);

            if (enrichment.isDuplicate) {
                logger.info(`[Analyzer] Skipping duplicate item (sim: ${enrichment.duplicates[0].similarity})`);
                continue;
            }

            // Stage 4: Architect (Structure & Solve)
            const metadata = {
                subject: scoutResult.suggested_subject || 'General',
                year: scoutResult.suggested_year || yearLevel || 'Unknown',
                sourceName
            };

            const item = await architect.constructKnowledgeItem(
                scribeItem,
                metadata,
                { standards: enrichment.standards, duplicates: enrichment.duplicates }
            );

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
            logger.info(`[Analyzer] Successfully committed ${knowledgeItems.length} items.`);
        }

        return {
            success: true,
            count: knowledgeItems.length,
            inferredSubject: scoutResult.suggested_subject,
            status: knowledgeItems.length > 0 ? 'success' : 'needs_clarification',
            clarificationQuestion: knowledgeItems.length === 0 ? "I couldn't identify any specific questions. Tap here to help me understand this artifact." : undefined
        };

    } catch (error: any) {
        if (error.message && error.message.includes('SAFETY_BLOCK')) {
            logger.warn(`[Analyzer] Pipeline blocked by safety filter: ${error.message}`);
            return {
                success: false,
                count: 0,
                inferredSubject: 'Unknown',
                status: 'failed',
                error: 'Content Blocked by Safety Policy'
            };
        }

        logger.error('[Analyzer] Pipeline failed', error);
        return {
            success: false,
            count: 0,
            inferredSubject: 'Unknown',
            status: 'failed',
            error: error.message
        };
    }
}
