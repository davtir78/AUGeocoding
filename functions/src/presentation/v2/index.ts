import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import admin from 'firebase-admin';
import { generateOutlines } from './generateOutlines';
import { assignLayouts } from './assignLayouts';
import { generateSlideContent } from './generateContent';
import { refineContent } from './refineContent';
import { generateImagePrompts } from './generateImagePrompts';
import { generateImages } from './generateImages';
import { generateAudioForPresentation } from '../../audio/generateAudio';

if (!admin.apps?.length) {
    admin.initializeApp();
}
const db = admin.firestore();

export const processPresentationV2 = onDocumentWritten(
    {
        document: 'presentations/{presentationId}',
        region: 'australia-southeast1',
        timeoutSeconds: 540, // Max 9 mins
        memory: '512MiB',
        secrets: ['OPENROUTER_API_KEY', 'OPENAI_API_KEY'],
    },
    async (event) => {
        const presentationId = event.params.presentationId;
        const afterData = event.data?.after?.data();
        const beforeData = event.data?.before?.data();

        if (!afterData) return;

        // FILTER: Only process V2 presentations in 'generating' state
        if (afterData.version !== 'v2') return;
        if (afterData.status !== 'generating') return;

        // Avoid re-triggering if status didn't change (deduplication)
        if (beforeData?.status === 'generating') return;

        logger.info(`[V2] Starting generation for presentation ${presentationId}`);
        logger.info(`[V2] CONFIG CHECK: autoGenerateAudio=${afterData.autoGenerateAudio} (type=${typeof afterData.autoGenerateAudio})`);

        try {
            await event.data?.after.ref.update({
                status: 'processing',
                processingStartedAt: new Date()
            });

            // 1. Generate Outlines
            logger.info(`[V2] Step 1: Generating Outlines for ${presentationId}`);
            const textModels = (afterData.textModels?.length > 0) ? afterData.textModels : (afterData.preferredModels?.length > 0 ? afterData.preferredModels : 'openai/gpt-4o-mini');

            const outline = await generateOutlines(
                afterData.topic,
                afterData.slideCount || 5, // Default to 5
                afterData.language || 'English',
                afterData.additionalContext,
                afterData.tone,
                afterData.verbosity,
                afterData.instructions,
                true, // includeTitleSlide
                afterData.ageGroup,
                textModels
            );

            // Update title if generated
            if (outline.title) {
                logger.info(`[V2] Generated Title: ${outline.title}`);
                await event.data?.after.ref.update({ title: outline.title });
            }

            // 2. Assign Layouts
            logger.info(`[V2] Step 2: Assigning Layouts`);
            const layoutIds = await assignLayouts(outline, afterData.instructions, textModels);

            // 3. Generate Content for each slide
            logger.info(`[V2] Step 3: Generating Content for ${layoutIds.length} slides`);

            const slidePromises = outline.slides.map(async (slideOutline, index) => {
                const layoutId = layoutIds[index] || 'bullet-points-slide';
                return generateSlideContent(
                    slideOutline,
                    layoutId,
                    afterData.language,
                    afterData.tone,
                    afterData.verbosity,
                    afterData.ageGroup,
                    textModels
                );
            });

            // Phase 1: Rough Draft
            let slidesContent = await Promise.all(slidePromises);

            // 4. Refine Content (Two-Pass)
            logger.info(`[V2] Step 4: Refining Content (AI Review)`);
            slidesContent = await refineContent(
                slidesContent,
                afterData.topic,
                afterData.instructions, // Pass original instructions
                textModels
            );

            // 4.5. Art Director Pass (Generate Image Prompts)
            logger.info(`[V2] Step 4.5: Generating Image Prompts (Art Director)`);
            slidesContent = await generateImagePrompts(
                slidesContent,
                afterData.topic,
                afterData.theme,
                afterData.ageGroup,
                textModels
            );

            // 5. Generate Images
            // 5. Generate Images & Audio (Parallel)
            // 5. Generate Images
            logger.info(`[V2] Step 5a: Generating Images`);
            const imageResult = await generateImages(slidesContent, afterData.preferredModels);
            let mergedSlides = imageResult.slides;

            // 6. Generate Audio (Sequential)
            logger.info(`[V2] Step 5b: Generating Audio (Sequential)`);
            const shouldGenerateAudio = afterData.autoGenerateAudio === true;
            const voiceToUse = (afterData as any).voice || 'alloy';

            if (shouldGenerateAudio) {
                logger.info(`[V2] Generating audio for ${presentationId} with voice ${voiceToUse}`);
                // Use mergedSlides (which has images) as base for audio
                const audioResultSlides = await generateAudioForPresentation(presentationId, mergedSlides, voiceToUse);

                logger.info(`[V2] Audio returned. Checking first slide: ${JSON.stringify(audioResultSlides[0])}`);

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
            logger.info(`[V2] Step 6: Saving completion`);

            // Format for storage
            const finalSlides = slidesContent.map((s, i) => ({
                id: `slide-${i + 1}`,
                slideNumber: i + 1,
                layoutId: s.layoutId,
                content: s.content,
                detailedNotes: s.detailedNotes || "",
                narrationScript: s.narrationScript || "",
                // Include generated audio
                ...((s as any).audioUrl ? { audioUrl: (s as any).audioUrl } : {}),
                ...((s as any).audioVoice ? { audioVoice: (s as any).audioVoice } : {}),
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
                    logger.info(`[V2] Updated parent job ${afterData.generationJobId} to completed`);
                } catch (e) {
                    logger.error(`[V2] Failed to update parent job ${afterData.generationJobId}`, e);
                }
            }

            logger.info(`[V2] Successfully generated presentation ${presentationId}`);

        } catch (error: any) {
            logger.error(`[V2] Failed to generate presentation ${presentationId}`, error);
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
                    logger.info(`[V2] Updated parent job ${afterData.generationJobId} to failed`);
                } catch (e) {
                    logger.error(`[V2] Failed to update parent job ${afterData.generationJobId} on failure`, e);
                }
            }
        }
    }
);
