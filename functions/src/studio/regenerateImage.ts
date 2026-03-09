import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { callOpenRouterImageAPI } from '../lib/openrouter';
import { enhanceInfographicPrompt } from '../infographic/generateInfographic';
import { ModelType, getModelsForType } from '../config/model-config';

interface RegenerateImageRequest {
    topic: string; // The slide title or subject
    context: string; // The slide content or bullet points
    style?: string;
    apiKey?: string; // Should be handled via auth context, but keeping interface open if needed internally
}

export const regenerateImage = onCall(
    {
        region: 'australia-southeast1',
        timeoutSeconds: 60,
        memory: '1GiB',
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError('unauthenticated', 'User must be logged in to regenerate images.');
        }

        const { topic, context, style = 'Modern Educational' } = request.data as RegenerateImageRequest;

        if (!topic) {
            throw new HttpsError('invalid-argument', 'Topic is required.');
        }

        logger.info(`[regenerateImage] User ${request.auth.uid} requesting image for "${topic}"`);

        try {
            // 1. Enhance Prompt (Reusing Infographic Logic for consistency)
            // We default to 'late-primary' if not specified, or could pass it in.
            const enhancedPrompt = await enhanceInfographicPrompt(topic, context || topic, style, 'late-primary');

            logger.info(`[regenerateImage] Enhanced Prompt: ${enhancedPrompt.substring(0, 100)}...`);

            // 2. Call OpenRouter Proxy (Server-side)
            // Use ImageHigh model (DALL-E 3 or similar high quality)
            const model = getModelsForType(ModelType.ImageHigh)[0];

            const imageUrl = await callOpenRouterImageAPI({
                model: model,
                prompt: enhancedPrompt
            });

            if (!imageUrl) {
                throw new Error('Failed to generate image URL from provider.');
            }

            return {
                success: true,
                imageUrl: imageUrl,
                prompt: enhancedPrompt
            };

        } catch (error: any) {
            logger.error('[regenerateImage] Failed:', error);
            throw new HttpsError('internal', error.message || 'Image generation failed.');
        }
    }
);
