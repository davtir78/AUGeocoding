import fetch from 'node-fetch';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import { ModelType, getModelsForType, getDefaultModelForType, getChatStrategyModels } from '../config/model-config';

const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_IMAGE_URL = 'https://openrouter.ai/api/v1/images/generations';

export interface Message {
    role: 'system' | 'user' | 'assistant';
    content: string | any[]; // any[] for multimodal
}

export interface OpenRouterRequest {
    model: string;
    messages: Message[];
    max_tokens?: number;
    temperature?: number;
    response_format?: { type: 'json_object' } | { type: 'json_schema', json_schema: Record<string, any> };
    headers?: Record<string, string>;
    modalities?: string[]; // Added for Gemini image gen
}

export async function callOpenRouterAPI(payload: OpenRouterRequest): Promise<any> {
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
                delete (apiPayload as any).temperature;
            }

            const resp = await fetch(OPENROUTER_CHAT_URL, {
                method: 'POST',
                headers,
                body: JSON.stringify(apiPayload),
            });

            if (!resp.ok) {
                const errText = await resp.text();
                logger.error('OpenRouter API call failed', { status: resp.status, body: errText, model: payload.model });
                const status = resp.status;
                // Retry on 502/503/504
                if ((status === 502 || status === 503 || status === 504) && attempt <= maxRetries) {
                    logger.warn(`OpenRouter server error ${status} (attempt ${attempt}), retrying...`);
                    await new Promise(r => setTimeout(r, 1000 * attempt));
                    continue;
                }
                throw new Error(`OpenRouter error: ${resp.status} ${errText}`);
            }

            const data = await resp.json();
            return data;
        } catch (error: any) {
            const isRetryable = error.code === 'ECONNRESET' ||
                error.code === 'ETIMEDOUT' ||
                error.code === 'EPIPE' ||
                error.message?.includes('Premature close');

            if (isRetryable && attempt <= maxRetries) {
                logger.warn(`OpenRouter network error (attempt ${attempt}): ${error.message}, retrying...`);
                await new Promise(r => setTimeout(r, 1000 * attempt));
                continue;
            }

            logger.error('LLM Network Error', error);
            throw error;
        }
    }
    throw new Error('OpenRouter API failed after retries');
}

/**
 * Calls OpenRouter with a list of candidate models.
 * If one fails, it tries the next in the list.
 */
export async function callOpenRouterWithFallback(
    models: string | string[] | ModelType,
    messages: Message[],
    options: Omit<OpenRouterRequest, 'model' | 'messages'> = {}
): Promise<any> {

    let modelList: string[] = [];

    if (typeof models === 'number') {
        // It's a ModelType enum
        modelList = getModelsForType(models);
    } else if (Array.isArray(models)) {
        modelList = models;
    } else {
        modelList = [models];
    }

    if (modelList.length === 0) {
        throw new Error('No models provided for OpenRouter call.');
    }

    let lastError: any = null;

    for (const model of modelList) {
        try {
            logger.info(`[OpenRouter] Attempting call with model: ${model}`);
            const result = await callOpenRouterAPI({
                model,
                messages,
                ...options
            });
            return result;
        } catch (error: any) {
            logger.warn(`[OpenRouter] Model ${model} failed. Error: ${error.message}`);
            lastError = error;
            // Continue to next model
        }
    }

    logger.error('[OpenRouter] All candidate models failed.', { models: modelList, lastError });
    throw lastError || new Error('All models failed');
}

export interface OpenRouterImageRequest {
    model?: string;
    prompt: string;
    n?: number;
    size?: string;
    modalities?: string[];
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
export async function callOpenRouterImageAPI(payload: OpenRouterImageRequest): Promise<string | null> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        throw new Error('OPENROUTER_API_KEY is not set');
    }

    const start = Date.now();
    // Default to our High Quality Image config
    const modelFn = payload.model || getDefaultModelForType(ModelType.ImageHigh);

    // Heuristic: "gemini" usually implies Chat-based image gen (inline base64)
    // "flux", "dall-e", "stability", "midjourney" imply Standard Image API (URL)
    // Now checking explicit list first
    const isChatImageModel = getChatStrategyModels().includes(modelFn) || modelFn.includes('gemini') || modelFn.includes('gpt-4o');

    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    logger.info(`[OpenRouterImage] [${requestId}] Requesting image from ${modelFn} (Mode: ${isChatImageModel ? 'Chat+Base64' : 'ImageURL'})`, {
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

            resp = await fetch(OPENROUTER_CHAT_URL, {
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

            resp = await fetch(OPENROUTER_IMAGE_URL, {
                method: 'POST',
                headers,
                body: JSON.stringify(apiPayload),
            });
        }

        const duration = Date.now() - start;

        if (!resp.ok) {
            const errText = await resp.text();
            logger.error(`[OpenRouterImage] [${requestId}] API Call Failed (${duration}ms)`, {
                status: resp.status,
                body: errText,
                model: modelFn
            });
            throw new Error(`OpenRouter API failed (${resp.status}): ${errText.substring(0, 200)}`);
        }

        const data: any = await resp.json();

        // PARSING RESPONSE

        // 1. Standard Image API Response (Flux, DALL-E)
        // Format: { data: [{ url: "..." }] }
        if (data.data && Array.isArray(data.data) && data.data.length > 0 && data.data[0].url) {
            const publicUrl = data.data[0].url;
            logger.info(`[OpenRouterImage] [${requestId}] Success URL (${duration}ms): ${publicUrl}`);
            return publicUrl;
        }

        // 2. Chat Response (Gemini - Base64 or URL in content)
        if (data.choices && data.choices.length > 0) {
            const message = data.choices[0].message;

            let base64Data: string | null = null;
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
                logger.info(`[OpenRouterImage] [${requestId}] Success Base64->URL (${duration}ms): ${publicUrl}`);
                return publicUrl;
            }
        }

        logger.warn(`[OpenRouterImage] [${requestId}] No image found in response`, { response: JSON.stringify(data).substring(0, 500) });
        throw new Error("Model returned valid response but no image found.");

    } catch (error: any) {
        throw error;
    }
}
