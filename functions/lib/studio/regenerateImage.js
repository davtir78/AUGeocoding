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
exports.regenerateImage = void 0;
const https_1 = require("firebase-functions/v2/https");
const logger = __importStar(require("firebase-functions/logger"));
const openrouter_1 = require("../lib/openrouter");
const generateInfographic_1 = require("../infographic/generateInfographic");
const model_config_1 = require("../config/model-config");
exports.regenerateImage = (0, https_1.onCall)({
    region: 'australia-southeast1',
    timeoutSeconds: 60,
    memory: '1GiB',
}, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'User must be logged in to regenerate images.');
    }
    const { topic, context, style = 'Modern Educational' } = request.data;
    if (!topic) {
        throw new https_1.HttpsError('invalid-argument', 'Topic is required.');
    }
    logger.info(`[regenerateImage] User ${request.auth.uid} requesting image for "${topic}"`);
    try {
        // 1. Enhance Prompt (Reusing Infographic Logic for consistency)
        // We default to 'late-primary' if not specified, or could pass it in.
        const enhancedPrompt = await (0, generateInfographic_1.enhanceInfographicPrompt)(topic, context || topic, style, 'late-primary');
        logger.info(`[regenerateImage] Enhanced Prompt: ${enhancedPrompt.substring(0, 100)}...`);
        // 2. Call OpenRouter Proxy (Server-side)
        // Use ImageHigh model (DALL-E 3 or similar high quality)
        const model = (0, model_config_1.getModelsForType)(model_config_1.ModelType.ImageHigh)[0];
        const imageUrl = await (0, openrouter_1.callOpenRouterImageAPI)({
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
    }
    catch (error) {
        logger.error('[regenerateImage] Failed:', error);
        throw new https_1.HttpsError('internal', error.message || 'Image generation failed.');
    }
});
