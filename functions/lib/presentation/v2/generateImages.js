"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateImages = generateImages;
const firebase_functions_1 = require("firebase-functions");
const openrouter_1 = require("../../lib/openrouter");
const model_config_1 = require("../../config/model-config");
/**
 * Generates images for slides by replacing imagePrompt with actual image URLs.
 * Uses OpenRouter's Image Generation API (DALL-E 3) with a fallback to Pollinations.ai.
 */
async function generateImages(slides, preferredModels) {
    // Models to try in order
    let candidateModels = (0, model_config_1.getModelsForType)(model_config_1.ModelType.ImageHigh);
    if (preferredModels && preferredModels.length > 0) {
        // Prepend preferences
        candidateModels = [...preferredModels, ...candidateModels];
        // Deduplicate
        candidateModels = [...new Set(candidateModels)];
    }
    const updatedSlides = [];
    const debugLog = [];
    for (let i = 0; i < slides.length; i++) {
        const slide = slides[i];
        const newContent = { ...slide.content };
        const slideId = `slide-${i + 1}`;
        // Check for 'image' field (common in schemas)
        if (newContent.image && newContent.image.imagePrompt) {
            const prompt = newContent.image.imagePrompt;
            let imageGenerated = false;
            const slideAttempts = [];
            for (const model of candidateModels) {
                if (imageGenerated)
                    break;
                // Skip DALL-E 3 for now
                if (model.includes('dall-e-3'))
                    continue;
                const attemptStart = Date.now();
                try {
                    const imageUrl = await (0, openrouter_1.callOpenRouterImageAPI)({
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
                        firebase_functions_1.logger.info(`[V2 Presentation] [${slideId}] Generated with ${model} (${duration}ms)`);
                    }
                }
                catch (e) {
                    const duration = Date.now() - attemptStart;
                    firebase_functions_1.logger.warn(`[V2 Presentation] [${slideId}] Failed with ${model} (${duration}ms)`, e);
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
                firebase_functions_1.logger.warn(`[V2 Presentation] [${slideId}] All OpenRouter models failed. Falling back to Pollinations.`);
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
