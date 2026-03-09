
import { callOpenRouterImageAPI } from '../lib/openrouter';
export { enhanceInfographicPrompt } from '../lib/infographicEnhancement';
import { enhanceInfographicPrompt } from '../lib/infographicEnhancement';
import { logger } from 'firebase-functions';
import { ModelType, getModelsForType } from '../config/model-config';

/**
 * Generates an infographic based on topic, data, and style.
 * 
 * @param topic The main subject of the infographic.
 * @param dataContext Detailed data or description to visualize.
 * @param style The visual style (e.g., "Clean", "Futuristic").
 * @param preferredModels Optional array of models to try in order.
 * @returns Public URL of the generated image.
 */
export async function generateInfographic(
    topic: string,
    dataContext: string,
    style: string,
    preferredModels: string[] | number = ModelType.ImageHigh,
    ageGroup: string = "late-primary"
): Promise<{ imageUrl: string, attemptLog: any[], visualDescription: string, deepDive?: string, generationPrompt?: string }> {

    let modelsToUse: string[] | number = preferredModels;

    // If it's a number (ModelType), resolve it OR pass it down if callOpenRouterWithFallback supports it.
    // However, generateInfographic iterates through models, so we MUST resolve it here.
    if (typeof preferredModels === 'number') {
        modelsToUse = getModelsForType(preferredModels);
    } else if (Array.isArray(preferredModels) && preferredModels.length === 0) {
        modelsToUse = getModelsForType(ModelType.ImageHigh);
    }

    const resolvedModels = Array.isArray(modelsToUse) ? modelsToUse : getModelsForType(modelsToUse as number);

    // Parallel Generation: Prompt Enhancement (for Image) + Deep Dive Content (for Viewer)
    const [prompt, deepDiveData] = await Promise.all([
        enhanceInfographicPrompt(topic, dataContext, style, ageGroup),
        generateDeepDiveContent(topic, dataContext, ageGroup)
    ]);

    logger.info(`[Infographic] Starting generation for "${topic}". Preferred candidates: ${Array.isArray(modelsToUse) ? modelsToUse.join(', ') : 'ModelType ' + modelsToUse}`);

    const attemptLog: any[] = [];
    let lastError: any = null;

    // Retry loop through preferred models
    for (const model of resolvedModels) {
        const attemptStart = Date.now();
        try {
            logger.info(`[Infographic] Attempting generation with model: ${model}`);

            const imageUrl = await callOpenRouterImageAPI({
                model: model,
                prompt: prompt
            });

            if (imageUrl) {
                const duration = Date.now() - attemptStart;
                logger.info(`[Infographic] Successfully generated image with ${model} (${duration}ms)`);

                attemptLog.push({
                    model,
                    status: 'success',
                    duration,
                    promptSnippet: prompt.substring(0, 1000) + "...",
                    timestamp: new Date().toISOString()
                });

                return {
                    imageUrl,
                    attemptLog,
                    visualDescription: deepDiveData.visualSummary, // Use the human-readable summary, not the raw prompt
                    deepDive: deepDiveData.deepDive,
                    generationPrompt: prompt // Save the prompt for debugging/transparency (hidden in UI)
                };
            }
        } catch (e: any) {
            const duration = Date.now() - attemptStart;
            logger.warn(`[Infographic] Model ${model} failed (${duration}ms)`, e);
            lastError = e;

            // Capture structured details if available (from OpenRouter wrapper)
            attemptLog.push({
                model,
                status: 'failed',
                duration,
                error: e.details || e.message || "Unknown error",
                promptSnippet: prompt.substring(0, 1000) + "...",
                timestamp: new Date().toISOString()
            });
        }
    }

    // If we reach here, all models failed
    logger.error(`[Infographic] All models failed for "${topic}"`);

    // Throw a custom error that includes the full log
    const finalError: any = new Error("All image models failed to generate content.");
    finalError.attemptLog = attemptLog;
    throw finalError;
}

/**
 * Generates rich educational context for the infographic.
 */
async function generateDeepDiveContent(topic: string, data: string, ageGroup: string) {
    const { callOpenRouter } = await import('../presentation/v2/utils');
    const { z } = await import('zod');
    const { getDefaultModelForType, ModelType } = await import('../config/model-config');

    // Helper: Robustly transform any input to a string, handling accidentally stringified JSON
    const formatObject = (val: any): string => {
        if (Array.isArray(val)) return val.map(v => typeof v === 'string' ? v : JSON.stringify(v)).join('\n');

        // Formatting Object as Key-Value HTML for readability
        return Object.entries(val)
            .map(([k, v]) => `<b>${k.replace(/([A-Z])/g, ' $1').trim()}:</b> ${v}`)
            .join('<br/><br/>');
    };

    const RobustString = z.any().transform((val) => {
        // 1. If it's a number, stringify
        if (typeof val === 'number') return String(val);

        // 2. If it's an object/array, format it
        if (typeof val === 'object' && val !== null) {
            return formatObject(val);
        }

        // 3. If it's a string, CHECK if it's actually JSON
        if (typeof val === 'string') {
            const trimmed = val.trim();
            if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
                try {
                    const parsed = JSON.parse(val);
                    if (typeof parsed === 'object' && parsed !== null) {
                        return formatObject(parsed);
                    }
                } catch (e) {
                    // Not valid JSON, just return the string
                }
            }
            return val;
        }

        return String(val || "");
    });

    const DeepDiveSchema = z.object({
        visualSummary: RobustString.describe("A concise, 2-sentence description of what an infographic about this topic *should* ideally show."),
        deepDive: RobustString.describe("A detailed, formatted HTML explanation of the topic. Use <p>, <h3>, <ul> tags. Return as a single string.")
    });

    try {
        const rawResponse = await callOpenRouter(
            getDefaultModelForType(ModelType.Review),
            [
                {
                    role: 'system',
                    content: `You are an expert educator creating a "Deep Dive" companion for an infographic about "${topic}".
                    Target Audience: ${ageGroup} students.
                    `
                },
                {
                    role: 'user',
                    content: `Here is the raw data/context provided for the infographic:\n${data}\n\nGenerate the deep dive content as a JSON object with keys: "visualSummary" and "deepDive".\nIMPORTANT: Both "visualSummary" and "deepDive" MUST be flat strings (valid HTML for deepDive), NOT nested JSON objects.`
                }
            ],
            DeepDiveSchema
        );

        logger.info("[Infographic] Raw Deep Dive Response:", JSON.stringify(rawResponse));

        // STRICT VALIDATION: Ensure the LLM actually returned the fields we need
        return DeepDiveSchema.parse(rawResponse);

    } catch (error) {
        logger.error("[Infographic] Failed to generate Deep Dive content", error);
        return {
            visualSummary: `An infographic exploring ${topic}.`,
            deepDive: `<p>Deep dive content could not be generated at this time. Explore the visual implementation for details about ${topic}.</p>`
        };
    }
}

