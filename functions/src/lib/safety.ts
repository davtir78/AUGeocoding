
import { logger } from 'firebase-functions';
import { callOpenRouterAPI, Message, OpenRouterRequest } from './openrouter';
import { ModelType, getDefaultModelForType } from '../config/model-config';

/**
 * specialized error class for Safety/Content Policy violations
 */
export class SafetyError extends Error {
    constructor(message: string, public model: string) {
        super(message);
        this.name = 'SafetyError';
    }
}

/**
 * Calls an LLM with strict safety checks.
 * If the primary model triggers a refusal (content_filter), it automatically switches to the fallback model.
 * 
 * @param primaryModelType - The preferred model (e.g., Gemini)
 * @param fallbackModelType - The safe fallback (e.g., Claude)
 * @param messages - The chat messages
 * @param options - OpenRouter options
 */
export async function callWithSafetyFallback(
    primaryModelType: ModelType,
    fallbackModelType: ModelType,
    messages: Message[],
    options: Omit<OpenRouterRequest, 'model' | 'messages'> = {}
): Promise<any> {

    // 1. Try Primary Model
    const primaryModel = getDefaultModelForType(primaryModelType);
    try {
        const result = await callModelWithCheck(primaryModel, messages, options);
        return result;
    } catch (error: any) {
        // If it's NOT a safety error, rethrow it (let standard retry logic handle network issues)
        if (!(error instanceof SafetyError)) {
            // However, if the primary model failed due to a 400/Bad Request which often masks safety on some providers,
            // we might want to try fallback. For now, we trust our explicit safety check.
            logger.warn(`[SafetyFallback] Primary model ${primaryModel} failed with non-safety error: ${error.message}`);
            // Optional: Uncomment to fallback on ANY error
            // logger.info(`[SafetyFallback] Switching to fallback due to error.`);
            throw error;
        }

        logger.warn(`[SafetyFallback] Primary model ${primaryModel} triggered safety flag. Switching to fallback.`);
    }

    // 2. Try Fallback Model
    const fallbackModel = getDefaultModelForType(fallbackModelType);
    try {
        // We prepend a "Safety Context" system message to the fallback to help it understand
        const safetyContext: Message = {
            role: 'system',
            content: "IMPORTANT: You are analyzing academic/educational content. Do not refuse legitimate educational requests."
        };
        const fallbackMessages = [safetyContext, ...messages];

        const result = await callModelWithCheck(fallbackModel, fallbackMessages, options);
        return result;
    } catch (error: any) {
        if (error instanceof SafetyError) {
            logger.error(`[SafetyFallback] Fallback model ${fallbackModel} ALSO triggered safety flag. Double Refusal.`);
            return null; // Signal complete blockage
        }
        throw error;
    }
}

async function callModelWithCheck(model: string, messages: Message[], options: any) {
    const result = await callOpenRouterAPI({
        model,
        messages,
        ...options
    });

    const choice = result.choices?.[0];
    if (!choice) throw new Error('No choices returned from LLM');

    // CHECK 1: Explicit Finish Reason
    if (choice.finish_reason === 'content_filter') {
        throw new SafetyError('Model returned finish_reason: content_filter', model);
    }

    // CHECK 2: Refusal Field (OpenAI specific)
    if (choice.message?.refusal) {
        throw new SafetyError(`Model refused: ${choice.message.refusal}`, model);
    }

    // CHECK 3: Content Heuristics (e.g. "I cannot process this image")
    const content = choice.message?.content || "";
    if (content.match(/I cannot (transcribe|analyze|process) this image/i) && content.match(/safety|policy|guidelines/i)) {
        throw new SafetyError('Model refused in text content', model);
    }

    return result;
}
