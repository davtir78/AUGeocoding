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
exports.enhanceInfographicPrompt = void 0;
exports.generateInfographic = generateInfographic;
const openrouter_1 = require("../lib/openrouter");
var infographicEnhancement_1 = require("../lib/infographicEnhancement");
Object.defineProperty(exports, "enhanceInfographicPrompt", { enumerable: true, get: function () { return infographicEnhancement_1.enhanceInfographicPrompt; } });
const infographicEnhancement_2 = require("../lib/infographicEnhancement");
const firebase_functions_1 = require("firebase-functions");
const model_config_1 = require("../config/model-config");
/**
 * Generates an infographic based on topic, data, and style.
 *
 * @param topic The main subject of the infographic.
 * @param dataContext Detailed data or description to visualize.
 * @param style The visual style (e.g., "Clean", "Futuristic").
 * @param preferredModels Optional array of models to try in order.
 * @returns Public URL of the generated image.
 */
async function generateInfographic(topic, dataContext, style, preferredModels = model_config_1.ModelType.ImageHigh, ageGroup = "late-primary") {
    let modelsToUse = preferredModels;
    // If it's a number (ModelType), resolve it OR pass it down if callOpenRouterWithFallback supports it.
    // However, generateInfographic iterates through models, so we MUST resolve it here.
    if (typeof preferredModels === 'number') {
        modelsToUse = (0, model_config_1.getModelsForType)(preferredModels);
    }
    else if (Array.isArray(preferredModels) && preferredModels.length === 0) {
        modelsToUse = (0, model_config_1.getModelsForType)(model_config_1.ModelType.ImageHigh);
    }
    const resolvedModels = Array.isArray(modelsToUse) ? modelsToUse : (0, model_config_1.getModelsForType)(modelsToUse);
    // Parallel Generation: Prompt Enhancement (for Image) + Deep Dive Content (for Viewer)
    const [prompt, deepDiveData] = await Promise.all([
        (0, infographicEnhancement_2.enhanceInfographicPrompt)(topic, dataContext, style, ageGroup),
        generateDeepDiveContent(topic, dataContext, ageGroup)
    ]);
    firebase_functions_1.logger.info(`[Infographic] Starting generation for "${topic}". Preferred candidates: ${Array.isArray(modelsToUse) ? modelsToUse.join(', ') : 'ModelType ' + modelsToUse}`);
    const attemptLog = [];
    let lastError = null;
    // Retry loop through preferred models
    for (const model of resolvedModels) {
        const attemptStart = Date.now();
        try {
            firebase_functions_1.logger.info(`[Infographic] Attempting generation with model: ${model}`);
            const imageUrl = await (0, openrouter_1.callOpenRouterImageAPI)({
                model: model,
                prompt: prompt
            });
            if (imageUrl) {
                const duration = Date.now() - attemptStart;
                firebase_functions_1.logger.info(`[Infographic] Successfully generated image with ${model} (${duration}ms)`);
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
        }
        catch (e) {
            const duration = Date.now() - attemptStart;
            firebase_functions_1.logger.warn(`[Infographic] Model ${model} failed (${duration}ms)`, e);
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
    firebase_functions_1.logger.error(`[Infographic] All models failed for "${topic}"`);
    // Throw a custom error that includes the full log
    const finalError = new Error("All image models failed to generate content.");
    finalError.attemptLog = attemptLog;
    throw finalError;
}
/**
 * Generates rich educational context for the infographic.
 */
async function generateDeepDiveContent(topic, data, ageGroup) {
    const { callOpenRouter } = await Promise.resolve().then(() => __importStar(require('../presentation/v2/utils')));
    const { z } = await Promise.resolve().then(() => __importStar(require('zod')));
    const { getDefaultModelForType, ModelType } = await Promise.resolve().then(() => __importStar(require('../config/model-config')));
    // Helper: Robustly transform any input to a string, handling accidentally stringified JSON
    const formatObject = (val) => {
        if (Array.isArray(val))
            return val.map(v => typeof v === 'string' ? v : JSON.stringify(v)).join('\n');
        // Formatting Object as Key-Value HTML for readability
        return Object.entries(val)
            .map(([k, v]) => `<b>${k.replace(/([A-Z])/g, ' $1').trim()}:</b> ${v}`)
            .join('<br/><br/>');
    };
    const RobustString = z.any().transform((val) => {
        // 1. If it's a number, stringify
        if (typeof val === 'number')
            return String(val);
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
                }
                catch (e) {
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
        const rawResponse = await callOpenRouter(getDefaultModelForType(ModelType.Review), [
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
        ], DeepDiveSchema);
        firebase_functions_1.logger.info("[Infographic] Raw Deep Dive Response:", JSON.stringify(rawResponse));
        // STRICT VALIDATION: Ensure the LLM actually returned the fields we need
        return DeepDiveSchema.parse(rawResponse);
    }
    catch (error) {
        firebase_functions_1.logger.error("[Infographic] Failed to generate Deep Dive content", error);
        return {
            visualSummary: `An infographic exploring ${topic}.`,
            deepDive: `<p>Deep dive content could not be generated at this time. Explore the visual implementation for details about ${topic}.</p>`
        };
    }
}
