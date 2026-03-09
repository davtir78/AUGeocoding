import { logger } from 'firebase-functions';
import { callOpenRouterImageAPI } from '../../lib/openrouter';
import { ModelType, getModelsForType } from '../../config/model-config';


/**
 * Generates images for slides by replacing imagePrompt with actual image URLs.
 * Uses OpenRouter's Image Generation API (DALL-E 3) with a fallback to Pollinations.ai.
 */
export async function generateImages(slides: { layoutId: string, content: any, detailedNotes: string, narrationScript: string }[], preferredModels?: string[]): Promise<{ slides: any[], debugLog: any[] }> {
    // Models to try in order
    let candidateModels = getModelsForType(ModelType.ImageHigh);

    if (preferredModels && preferredModels.length > 0) {
        // Prepend preferences
        candidateModels = [...preferredModels, ...candidateModels];
        // Deduplicate
        candidateModels = [...new Set(candidateModels)];
    }

    const updatedSlides = [];
    const debugLog: any[] = [];

    for (let i = 0; i < slides.length; i++) {
        const slide = slides[i];
        const newContent = { ...slide.content };
        const slideId = `slide-${i + 1}`;

        // Check for 'image' field (common in schemas)
        if (newContent.image && newContent.image.imagePrompt) {
            const prompt = newContent.image.imagePrompt;
            let imageGenerated = false;
            const slideAttempts: any[] = [];

            for (const model of candidateModels) {
                if (imageGenerated) break;

                // Skip DALL-E 3 for now
                if (model.includes('dall-e-3')) continue;

                const attemptStart = Date.now();
                try {
                    const imageUrl = await callOpenRouterImageAPI({
                        model: model,
                        prompt: prompt
                    });

                    const duration = Date.now() - attemptStart;
                    if (imageUrl) {
                        newContent.image.imageUrl = imageUrl;
                        imageGenerated = true;

                        slideAttempts.push({
                            model,
                            status: 'success',
                            duration,
                            promptSnippet: prompt.substring(0, 1000) + "...",
                            timestamp: new Date().toISOString()
                        });
                        logger.info(`[V2 Presentation] [${slideId}] Generated with ${model} (${duration}ms)`);
                    }
                } catch (e: any) {
                    const duration = Date.now() - attemptStart;
                    logger.warn(`[V2 Presentation] [${slideId}] Failed with ${model} (${duration}ms)`, e);

                    slideAttempts.push({
                        model,
                        status: 'failed',
                        duration,
                        error: e.details || e.message || "Unknown error",
                        promptSnippet: prompt.substring(0, 1000) + "...",
                        timestamp: new Date().toISOString()
                    });
                }
            }

            if (!imageGenerated) {
                logger.warn(`[V2 Presentation] [${slideId}] All OpenRouter models failed. Falling back to Pollinations.`);
                const safePrompt = encodeURIComponent(prompt.substring(0, 500));
                newContent.image.imageUrl = `https://image.pollinations.ai/prompt/${safePrompt}`;

                slideAttempts.push({
                    model: 'pollinations-fallback',
                    status: 'fallback',
                    timestamp: new Date().toISOString()
                });
            }

            debugLog.push({
                slideId,
                topicSnippet: newContent.title || prompt.substring(0, 30),
                attempts: slideAttempts
            });
        }

        updatedSlides.push({
            ...slide,
            content: newContent
        });
    }

    return { slides: updatedSlides, debugLog };
}
