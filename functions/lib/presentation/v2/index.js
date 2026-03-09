"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processPresentationV2 = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const firebase_functions_1 = require("firebase-functions");
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const generateOutlines_1 = require("./generateOutlines");
const assignLayouts_1 = require("./assignLayouts");
const generateContent_1 = require("./generateContent");
const refineContent_1 = require("./refineContent");
const generateImagePrompts_1 = require("./generateImagePrompts");
const generateImages_1 = require("./generateImages");
const generateAudio_1 = require("../../audio/generateAudio");
if (!firebase_admin_1.default.apps?.length) {
    firebase_admin_1.default.initializeApp();
}
const db = firebase_admin_1.default.firestore();
exports.processPresentationV2 = (0, firestore_1.onDocumentWritten)({
    document: 'presentations/{presentationId}',
    region: 'australia-southeast1',
    timeoutSeconds: 540, // Max 9 mins
    memory: '512MiB',
    secrets: ['OPENROUTER_API_KEY', 'OPENAI_API_KEY'],
}, async (event) => {
    const presentationId = event.params.presentationId;
    const afterData = event.data?.after?.data();
    const beforeData = event.data?.before?.data();
    if (!afterData)
        return;
    // FILTER: Only process V2 presentations in 'generating' state
    if (afterData.version !== 'v2')
        return;
    if (afterData.status !== 'generating')
        return;
    // Avoid re-triggering if status didn't change (deduplication)
    if (beforeData?.status === 'generating')
        return;
    firebase_functions_1.logger.info(`[V2] Starting generation for presentation ${presentationId}`);
    firebase_functions_1.logger.info(`[V2] CONFIG CHECK: autoGenerateAudio=${afterData.autoGenerateAudio} (type=${typeof afterData.autoGenerateAudio})`);
    try {
        await event.data?.after.ref.update({
            status: 'processing',
            processingStartedAt: new Date()
        });
        // 1. Generate Outlines
        firebase_functions_1.logger.info(`[V2] Step 1: Generating Outlines for ${presentationId}`);
        const textModels = (afterData.textModels?.length > 0) ? afterData.textModels : (afterData.preferredModels?.length > 0 ? afterData.preferredModels : 'openai/gpt-4o-mini');
        const outline = await (0, generateOutlines_1.generateOutlines)(afterData.topic, afterData.slideCount || 5, // Default to 5
        afterData.language || 'English', afterData.additionalContext, afterData.tone, afterData.verbosity, afterData.instructions, true, // includeTitleSlide
        afterData.ageGroup, textModels);
        // Update title if generated
        if (outline.title) {
            firebase_functions_1.logger.info(`[V2] Generated Title: ${outline.title}`);
            await event.data?.after.ref.update({ title: outline.title });
        }
        // 2. Assign Layouts
        firebase_functions_1.logger.info(`[V2] Step 2: Assigning Layouts`);
        const layoutIds = await (0, assignLayouts_1.assignLayouts)(outline, afterData.instructions, textModels);
        // 3. Generate Content for each slide
        firebase_functions_1.logger.info(`[V2] Step 3: Generating Content for ${layoutIds.length} slides`);
        const slidePromises = outline.slides.map(async (slideOutline, index) => {
            const layoutId = layoutIds[index] || 'bullet-points-slide';
            return (0, generateContent_1.generateSlideContent)(slideOutline, layoutId, afterData.language, afterData.tone, afterData.verbosity, afterData.ageGroup, textModels);
        });
        // Phase 1: Rough Draft
        let slidesContent = await Promise.all(slidePromises);
        // 4. Refine Content (Two-Pass)
        firebase_functions_1.logger.info(`[V2] Step 4: Refining Content (AI Review)`);
        slidesContent = await (0, refineContent_1.refineContent)(slidesContent, afterData.topic, afterData.instructions, // Pass original instructions
        textModels);
        // 4.5. Art Director Pass (Generate Image Prompts)
        firebase_functions_1.logger.info(`[V2] Step 4.5: Generating Image Prompts (Art Director)`);
        slidesContent = await (0, generateImagePrompts_1.generateImagePrompts)(slidesContent, afterData.topic, afterData.theme, afterData.ageGroup, textModels);
        // 5. Generate Images
        // 5. Generate Images & Audio (Parallel)
        // 5. Generate Images
        firebase_functions_1.logger.info(`[V2] Step 5a: Generating Images`);
        const imageResult = await (0, generateImages_1.generateImages)(slidesContent, afterData.preferredModels);
        let mergedSlides = imageResult.slides;
        // 6. Generate Audio (Sequential)
        firebase_functions_1.logger.info(`[V2] Step 5b: Generating Audio (Sequential)`);
        const shouldGenerateAudio = afterData.autoGenerateAudio === true;
        const voiceToUse = afterData.voice || 'alloy';
        if (shouldGenerateAudio) {
            firebase_functions_1.logger.info(`[V2] Generating audio for ${presentationId} with voice ${voiceToUse}`);
            // Use mergedSlides (which has images) as base for audio
            const audioResultSlides = await (0, generateAudio_1.generateAudioForPresentation)(presentationId, mergedSlides, voiceToUse);
            firebase_functions_1.logger.info(`[V2] Audio returned. Checking first slide: ${JSON.stringify(audioResultSlides[0])}`);
            mergedSlides = mergedSlides.map((slide, i) => {
                const audioSlide = audioResultSlides[i];
                return {
                    ...slide,
                    audioUrl: audioSlide?.audioUrl,
                    audioVoice: audioSlide?.audioVoice
                };
            });
        }
        slidesContent = mergedSlides;
        const debugLog = imageResult.debugLog;
        // 6. Save to Firestore
        firebase_functions_1.logger.info(`[V2] Step 6: Saving completion`);
        // Format for storage
        const finalSlides = slidesContent.map((s, i) => ({
            id: `slide-${i + 1}`,
            slideNumber: i + 1,
            layoutId: s.layoutId,
            content: s.content,
            detailedNotes: s.detailedNotes || "",
            narrationScript: s.narrationScript || "",
            // Include generated audio
            ...(s.audioUrl ? { audioUrl: s.audioUrl } : {}),
            ...(s.audioVoice ? { audioVoice: s.audioVoice } : {}),
        }));
        await event.data?.after.ref.update({
            slides: finalSlides,
            status: 'completed',
            debugLog: debugLog, // Save image gen telemetry
            completedAt: new Date()
        });
        // Update parent Generation Job if exists
        if (afterData.generationJobId) {
            try {
                await db.collection('generationJobs').doc(afterData.generationJobId).update({
                    status: 'completed',
                    presentationId: presentationId, // Ensure it's linked
                    debugLog: debugLog, // Sync log to job for easy access
                    completedAt: new Date()
                });
                firebase_functions_1.logger.info(`[V2] Updated parent job ${afterData.generationJobId} to completed`);
            }
            catch (e) {
                firebase_functions_1.logger.error(`[V2] Failed to update parent job ${afterData.generationJobId}`, e);
            }
        }
        firebase_functions_1.logger.info(`[V2] Successfully generated presentation ${presentationId}`);
    }
    catch (error) {
        firebase_functions_1.logger.error(`[V2] Failed to generate presentation ${presentationId}`, error);
        await event.data?.after.ref.update({
            status: 'failed',
            error: error.message || 'Unknown error'
        });
        // Update parent Generation Job if exists
        if (afterData.generationJobId) {
            try {
                await db.collection('generationJobs').doc(afterData.generationJobId).update({
                    status: 'failed',
                    error: error.message || 'Presentation generation failed',
                    updatedAt: new Date()
                });
                firebase_functions_1.logger.info(`[V2] Updated parent job ${afterData.generationJobId} to failed`);
            }
            catch (e) {
                firebase_functions_1.logger.error(`[V2] Failed to update parent job ${afterData.generationJobId} on failure`, e);
            }
        }
    }
});
