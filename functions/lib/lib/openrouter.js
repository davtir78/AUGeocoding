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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.callOpenRouterAPI = callOpenRouterAPI;
exports.callOpenRouterWithFallback = callOpenRouterWithFallback;
exports.callOpenRouterImageAPI = callOpenRouterImageAPI;
const node_fetch_1 = __importDefault(require("node-fetch"));
const firebase_functions_1 = require("firebase-functions");
const admin = __importStar(require("firebase-admin"));
const model_config_1 = require("../config/model-config");
const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_IMAGE_URL = 'https://openrouter.ai/api/v1/images/generations';
async function callOpenRouterAPI(payload) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        throw new Error('OPENROUTER_API_KEY is not set');
    }
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://scholars-alley.com', // Required by OpenRouter
        'X-Title': 'Scholars Alley',
        ...(payload.headers || {})
    };
    // Remove headers from payload
    const { headers: _h, ...apiPayload } = payload;
    const maxRetries = 2;
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
        try {
            // Remove temperature for models that don't support it (e.g. OpenAI o1/o3)
            if (payload.model.includes('openai/o') || payload.model.includes('reasoning')) {
                delete apiPayload.temperature;
            }
            const resp = await (0, node_fetch_1.default)(OPENROUTER_CHAT_URL, {
                method: 'POST',
                headers,
                body: JSON.stringify(apiPayload),
            });
            if (!resp.ok) {
                const errText = await resp.text();
                firebase_functions_1.logger.error('OpenRouter API call failed', { status: resp.status, body: errText, model: payload.model });
                const status = resp.status;
                // Retry on 502/503/504
                if ((status === 502 || status === 503 || status === 504) && attempt <= maxRetries) {
                    firebase_functions_1.logger.warn(`OpenRouter server error ${status} (attempt ${attempt}), retrying...`);
                    await new Promise(r => setTimeout(r, 1000 * attempt));
                    continue;
                }
                throw new Error(`OpenRouter error: ${resp.status} ${errText}`);
            }
            const data = await resp.json();
            return data;
        }
        catch (error) {
            const isRetryable = error.code === 'ECONNRESET' ||
                error.code === 'ETIMEDOUT' ||
                error.code === 'EPIPE' ||
                error.message?.includes('Premature close');
            if (isRetryable && attempt <= maxRetries) {
                firebase_functions_1.logger.warn(`OpenRouter network error (attempt ${attempt}): ${error.message}, retrying...`);
                await new Promise(r => setTimeout(r, 1000 * attempt));
                continue;
            }
            firebase_functions_1.logger.error('LLM Network Error', error);
            throw error;
        }
    }
    throw new Error('OpenRouter API failed after retries');
}
/**
 * Calls OpenRouter with a list of candidate models.
 * If one fails, it tries the next in the list.
 */
async function callOpenRouterWithFallback(models, messages, options = {}) {
    let modelList = [];
    if (typeof models === 'number') {
        // It's a ModelType enum
        modelList = (0, model_config_1.getModelsForType)(models);
    }
    else if (Array.isArray(models)) {
        modelList = models;
    }
    else {
        modelList = [models];
    }
    if (modelList.length === 0) {
        throw new Error('No models provided for OpenRouter call.');
    }
    let lastError = null;
    for (const model of modelList) {
        try {
            firebase_functions_1.logger.info(`[OpenRouter] Attempting call with model: ${model}`);
            const result = await callOpenRouterAPI({
                model,
                messages,
                ...options
            });
            return result;
        }
        catch (error) {
            firebase_functions_1.logger.warn(`[OpenRouter] Model ${model} failed. Error: ${error.message}`);
            lastError = error;
            // Continue to next model
        }
    }
    firebase_functions_1.logger.error('[OpenRouter] All candidate models failed.', { models: modelList, lastError });
    throw lastError || new Error('All models failed');
}
/**
 * Generates an image via OpenRouter using the Chat Completions endpoint (for Gemini etc).
 * Extracts base64 image, uploads to Firebase Storage, returning URL.
 */
/**
 * Generates an image via OpenRouter using the Chat Completions endpoint (for Gemini etc).
 * Extracts base64 image, uploads to Firebase Storage, returning URL.
 */
/**
 * Generates an image via OpenRouter.
 * Automatically routes to Chat API (for Gemini) or Image API (for DALL-E/Flux) based on model ID.
 */
async function callOpenRouterImageAPI(payload) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        throw new Error('OPENROUTER_API_KEY is not set');
    }
    const start = Date.now();
    // Default to our High Quality Image config
    const modelFn = payload.model || (0, model_config_1.getDefaultModelForType)(model_config_1.ModelType.ImageHigh);
    // Heuristic: "gemini" usually implies Chat-based image gen (inline base64)
    // "flux", "dall-e", "stability", "midjourney" imply Standard Image API (URL)
    // Now checking explicit list first
    const isChatImageModel = (0, model_config_1.getChatStrategyModels)().includes(modelFn) || modelFn.includes('gemini') || modelFn.includes('gpt-4o');
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    firebase_functions_1.logger.info(`[OpenRouterImage] [${requestId}] Requesting image from ${modelFn} (Mode: ${isChatImageModel ? 'Chat+Base64' : 'ImageURL'})`, {
        model: modelFn,
        promptSnippet: payload.prompt.substring(0, 50) + "...",
        timestamp: new Date().toISOString()
    });
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://scholars-alley.com',
        'X-Title': 'Scholars Alley',
    };
    try {
        let resp;
        // BRANCH A: Chat Completion Custom Logic (Gemini/GPT-4o)
        if (isChatImageModel) {
            const apiPayload = {
                model: modelFn,
                messages: [
                    {
                        role: 'user',
                        content: payload.prompt
                    }
                ],
                modalities: payload.modalities || ["image"], // Default to image-only for generation requests
                max_tokens: 30000, // Buffer for base64
                safety_settings: [
                    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
                ]
            };
            resp = await (0, node_fetch_1.default)(OPENROUTER_CHAT_URL, {
                method: 'POST',
                headers,
                body: JSON.stringify(apiPayload),
            });
        }
        // BRANCH B: Standard Image Generation Endpoint (Flux, DALL-E, etc.)
        else {
            const apiPayload = {
                model: modelFn,
                prompt: payload.prompt,
                n: payload.n || 1,
                size: payload.size || "1024x1024"
            };
            resp = await (0, node_fetch_1.default)(OPENROUTER_IMAGE_URL, {
                method: 'POST',
                headers,
                body: JSON.stringify(apiPayload),
            });
        }
        const duration = Date.now() - start;
        if (!resp.ok) {
            const errText = await resp.text();
            firebase_functions_1.logger.error(`[OpenRouterImage] [${requestId}] API Call Failed (${duration}ms)`, {
                status: resp.status,
                body: errText,
                model: modelFn
            });
            throw new Error(`OpenRouter API failed (${resp.status}): ${errText.substring(0, 200)}`);
        }
        const data = await resp.json();
        // PARSING RESPONSE
        // 1. Standard Image API Response (Flux, DALL-E)
        // Format: { data: [{ url: "..." }] }
        if (data.data && Array.isArray(data.data) && data.data.length > 0 && data.data[0].url) {
            const publicUrl = data.data[0].url;
            firebase_functions_1.logger.info(`[OpenRouterImage] [${requestId}] Success URL (${duration}ms): ${publicUrl}`);
            return publicUrl;
        }
        // 2. Chat Response (Gemini - Base64 or URL in content)
        if (data.choices && data.choices.length > 0) {
            const message = data.choices[0].message;
            let base64Data = null;
            let imageType = "png";
            // Gemini 2.0 Flash often returns 'images' array in message
            if (message.images && message.images.length > 0) {
                const dataUrl = message.images[0].image_url.url; // "data:image/png;base64,..."
                const parts = dataUrl.split(",");
                if (parts.length === 2) {
                    base64Data = parts[1];
                }
            }
            // Or markdown link in content
            else if (message.content) {
                const imageRegex = /data:image\/(\w+);base64,([^"'\)\s]+)/;
                const match = message.content.match(imageRegex);
                if (match) {
                    imageType = match[1];
                    base64Data = match[2];
                }
            }
            if (base64Data) {
                // Upload Base64 to Firebase
                const buffer = Buffer.from(base64Data, 'base64');
                const fileName = `generated_images/${Date.now()}_${Math.random().toString(36).substring(7)}.${imageType}`;
                const bucket = admin.storage().bucket();
                const file = bucket.file(fileName);
                const token = Math.random().toString(36).substring(2, 15);
                await file.save(buffer, {
                    metadata: {
                        contentType: `image/${imageType}`,
                        metadata: { firebaseStorageDownloadTokens: token }
                    },
                    public: true
                });
                const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(fileName)}?alt=media&token=${token}`;
                firebase_functions_1.logger.info(`[OpenRouterImage] [${requestId}] Success Base64->URL (${duration}ms): ${publicUrl}`);
                return publicUrl;
            }
        }
        firebase_functions_1.logger.warn(`[OpenRouterImage] [${requestId}] No image found in response`, { response: JSON.stringify(data).substring(0, 500) });
        throw new Error("Model returned valid response but no image found.");
    }
    catch (error) {
        throw error;
    }
}
