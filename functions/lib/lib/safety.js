"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SafetyError = void 0;
exports.callWithSafetyFallback = callWithSafetyFallback;
const firebase_functions_1 = require("firebase-functions");
const openrouter_1 = require("./openrouter");
const model_config_1 = require("../config/model-config");
/**
 * specialized error class for Safety/Content Policy violations
 */
class SafetyError extends Error {
    constructor(message, model) {
        super(message);
        this.model = model;
        this.name = 'SafetyError';
    }
}
exports.SafetyError = SafetyError;
/**
 * Calls an LLM with strict safety checks.
 * If the primary model triggers a refusal (content_filter), it automatically switches to the fallback model.
 *
 * @param primaryModelType - The preferred model (e.g., Gemini)
 * @param fallbackModelType - The safe fallback (e.g., Claude)
 * @param messages - The chat messages
 * @param options - OpenRouter options
 */
async function callWithSafetyFallback(primaryModelType, fallbackModelType, messages, options = {}) {
    // 1. Try Primary Model
    const primaryModel = (0, model_config_1.getDefaultModelForType)(primaryModelType);
    try {
        const result = await callModelWithCheck(primaryModel, messages, options);
        return result;
    }
    catch (error) {
        // If it's NOT a safety error, rethrow it (let standard retry logic handle network issues)
        if (!(error instanceof SafetyError)) {
            // However, if the primary model failed due to a 400/Bad Request which often masks safety on some providers,
            // we might want to try fallback. For now, we trust our explicit safety check.
            firebase_functions_1.logger.warn(`[SafetyFallback] Primary model ${primaryModel} failed with non-safety error: ${error.message}`);
            // Optional: Uncomment to fallback on ANY error
            // logger.info(`[SafetyFallback] Switching to fallback due to error.`);
            throw error;
        }
        firebase_functions_1.logger.warn(`[SafetyFallback] Primary model ${primaryModel} triggered safety flag. Switching to fallback.`);
    }
    // 2. Try Fallback Model
    const fallbackModel = (0, model_config_1.getDefaultModelForType)(fallbackModelType);
    try {
        // We prepend a "Safety Context" system message to the fallback to help it understand
        const safetyContext = {
            role: 'system',
            content: "IMPORTANT: You are analyzing academic/educational content. Do not refuse legitimate educational requests."
        };
        const fallbackMessages = [safetyContext, ...messages];
        const result = await callModelWithCheck(fallbackModel, fallbackMessages, options);
        return result;
    }
    catch (error) {
        if (error instanceof SafetyError) {
            firebase_functions_1.logger.error(`[SafetyFallback] Fallback model ${fallbackModel} ALSO triggered safety flag. Double Refusal.`);
            return null; // Signal complete blockage
        }
        throw error;
    }
}
async function callModelWithCheck(model, messages, options) {
    const result = await (0, openrouter_1.callOpenRouterAPI)({
        model,
        messages,
        ...options
    });
    const choice = result.choices?.[0];
    if (!choice)
        throw new Error('No choices returned from LLM');
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
