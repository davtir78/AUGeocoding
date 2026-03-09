"use strict";
/**
 * Firebase Function: openrouterProxy
 *
 * HTTP POST proxy that forwards a request to OpenRouter using a server-side API key.
 * Purpose: keep OPENROUTER_API_KEY out of client-side code and allow request/response
 * logging, model routing, token/cost estimation, and dual-model verification in the future.
 *
 * Deployment notes:
 *  - This file is a stub. Ensure your Functions project has the firebase-functions SDK
 *    and is configured to build TypeScript if required.
 *  - Set the OpenRouter API key in your functions environment:
 *      firebase functions:config:set openrouter.key="YOUR_KEY"
 *    or (for the newer env vars):
 *      firebase functions:env:set OPENROUTER_API_KEY="YOUR_KEY"
 *  - Deploy with: firebase deploy --only functions:openrouterProxy
 *
 * Security:
 *  - Do NOT put the OpenRouter API key in client-side bundles or checked-in files.
 *  - Consider adding authentication (validate Firebase ID token) before proxying.
 *
 * Behavior:
 *  - Expects POST JSON body with at least: { model, prompt, max_tokens?, temperature?, meta? }
 *  - Forwards to OpenRouter Chat Completions endpoint (adjust endpoint if you're calling
 *    image generation or other specialized APIs).
 *  - Returns JSON with a shape like:
 *      { id, model, output, meta, tokens_est, raw: <original provider response> }
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.openrouterProxy = void 0;
const https_1 = require("firebase-functions/v2/https");
const firebase_functions_1 = require("firebase-functions");
const firebase_admin_1 = __importDefault(require("firebase-admin"));
// Initialize Firebase Admin (idempotent)
if (!firebase_admin_1.default.apps?.length) {
    firebase_admin_1.default.initializeApp();
}
const firestore = firebase_admin_1.default.firestore();
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
if (!OPENROUTER_API_KEY) {
    firebase_functions_1.logger.warn('OPENROUTER_API_KEY not found in environment. Set it with `firebase functions:env:set OPENROUTER_API_KEY="..."`');
}
// OpenRouter chat endpoint
const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
const evalHelper_1 = require("./evalHelper");
const openrouter_1 = require("./lib/openrouter");
/**
 * Server-side debug helpers — gate noisy logs behind OPENROUTER_DEBUG or DEBUG env flags.
 */
function isDebugEnabled() {
    try {
        const v = String(process.env.OPENROUTER_DEBUG ?? process.env.DEBUG ?? '').toLowerCase();
        return v === '1' || v === 'true';
    }
    catch {
        return false;
    }
}
const _dbg = isDebugEnabled();
function dbgLog(...args) {
    if (!_dbg)
        return;
    firebase_functions_1.logger.log(...args);
}
function dbgWarn(...args) {
    if (!_dbg)
        return;
    firebase_functions_1.logger.warn(...args);
}
function dbgError(...args) {
    if (!_dbg)
        return;
    firebase_functions_1.logger.error(...args);
}
exports.openrouterProxy = (0, https_1.onRequest)({
    region: 'australia-southeast1',
    cors: true,
    secrets: ['OPENROUTER_API_KEY']
}, async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed. Use POST.' });
        return;
    }
    if (!OPENROUTER_API_KEY) {
        res.status(500).json({ error: 'Server misconfiguration: OPENROUTER_API_KEY not set.' });
        return;
    }
    const body = req.body || {};
    const { model, prompt, messages, max_tokens, temperature, meta, action, studentAnswer, context } = body;
    // Dedicated evaluation action
    if (action === 'evaluate') {
        try {
            const answerText = String(studentAnswer ?? prompt ?? '');
            const ctxText = String(context ?? '');
            const evalResult = await (0, evalHelper_1.getEvaluationResult)(answerText, ctxText);
            res.json({ evaluation: evalResult });
        }
        catch (e) {
            firebase_functions_1.logger.error('Evaluation endpoint error', e);
            res.status(500).json({ error: 'Evaluation failed', message: String(e) });
        }
        return;
    }
    // DEBUG LOG (dev-only)
    try {
        const isDev = process.env.NODE_ENV !== 'production';
        if (isDev) {
            firebase_functions_1.logger.log('openrouterProxy request:', {
                model: model ?? null,
                promptPreview: typeof prompt === 'string' ? prompt.slice(0, 300) : null,
                messagesPreview: messages ? `Array of ${messages.length} messages` : null,
                max_tokens: max_tokens ?? null,
                temperature: typeof temperature === 'number' ? temperature : null,
                meta: meta ?? null,
            });
        }
    }
    catch (e) {
        firebase_functions_1.logger.error('openrouterProxy logging error', e);
    }
    if (!model || (!prompt && !messages && !meta?.image_url)) {
        res.status(400).json({ error: 'Missing required fields: model and (prompt, messages, or meta.image_url for vision).' });
        return;
    }
    try {
        const candidates = Array.isArray(model) ? model : [model];
        let lastFailure = null;
        for (const candidate of candidates) {
            try {
                let openRouterMessages;
                // Handle vision mode if meta.image_url present (construct multimodal if not already messages)
                if (meta?.image_url && (!messages || !Array.isArray(messages) || messages.length === 0)) {
                    const visionPrompt = meta.vision_prompt || 'Analyze this educational image (e.g., homework problem) and describe the key concepts, math, or steps shown in detail for Socratic tutoring.';
                    openRouterMessages = [{
                            role: 'user',
                            content: [
                                { type: 'text', text: visionPrompt },
                                { type: 'image_url', image_url: { url: meta.image_url } }
                            ]
                        }];
                    firebase_functions_1.logger.info(`Constructed vision messages for model ${candidate} with image_url`);
                }
                else if (messages && Array.isArray(messages) && messages.length > 0) {
                    openRouterMessages = messages;
                }
                else if (prompt) {
                    openRouterMessages = [{ role: 'user', content: prompt }];
                }
                else {
                    throw new Error('No valid messages or prompt provided');
                }
                const payload = {
                    model: candidate,
                    messages: openRouterMessages,
                    max_tokens: max_tokens ?? 512,
                    temperature: typeof temperature === 'number' ? temperature : 0.2,
                };
                dbgLog('openrouterProxy: trying model candidate ->', candidate);
                // Use shared library
                const raw = await (0, openrouter_1.callOpenRouterAPI)(payload);
                // DEBUG LOG
                try {
                    firebase_functions_1.logger.log('openrouterProxy provider response preview:', {
                        candidate,
                        id: raw?.id ?? null,
                        usage: raw?.usage ?? null,
                        choicesPreview: raw?.choices
                            ? raw.choices.map((c) => {
                                const text = c?.message?.content ?? c?.text ?? '';
                                return String(text).slice(0, 200);
                            })
                            : null,
                    });
                }
                catch (e) {
                    firebase_functions_1.logger.error('openrouterProxy provider logging error', e);
                }
                let output = '';
                if (raw?.choices?.[0]?.message?.content) {
                    output = raw.choices[0].message.content;
                }
                else if (raw?.choices?.[0]?.text) {
                    output = raw.choices[0].text;
                }
                else if (raw?.output) {
                    output = raw.output;
                }
                else {
                    output = JSON.stringify(raw);
                }
                const metaOut = {
                    model_used: candidate,
                    tokens_est: raw?.usage ?? null,
                    request_meta: meta ?? null,
                };
                // Telemetry
                try {
                    const telemetryPayload = {
                        eventType: 'openrouter.response',
                        timestamp: Date.now(),
                        source: 'server',
                        payload: {
                            model_requested: model,
                            model_used: candidate,
                            id: raw?.id ?? null,
                            choicesPreview: raw?.choices
                                ? raw.choices.map((c) => {
                                    const text = c?.message?.content ?? c?.text ?? '';
                                    return String(text).slice(0, 200);
                                })
                                : null,
                            usage: raw?.usage ?? null,
                            request_meta: meta ?? null,
                        },
                        redacted: true,
                    };
                    firestore.collection('analytics_events').add(telemetryPayload).catch(() => { });
                }
                catch (e) {
                    firebase_functions_1.logger.warn('openrouterProxy telemetry write failed', e);
                }
                // Evaluation enqueue
                try {
                    const evalRequested = Boolean((meta && (meta.request_evaluation || meta.eval === true)) || process.env.OPENROUTER_EVAL_ENABLED === 'true');
                    if (evalRequested) {
                        const evalEvent = {
                            eventType: 'evaluation.requested',
                            timestamp: Date.now(),
                            source: 'server',
                            payload: {
                                model_used: candidate,
                                promptPreview: String(prompt).slice(0, 1000),
                                responsePreview: String(output).slice(0, 2000),
                                request_meta: meta ?? null,
                            },
                            redacted: true,
                        };
                        firestore.collection('analytics_events').add(evalEvent).catch(() => { });
                    }
                }
                catch (e) {
                    firebase_functions_1.logger.warn('openrouterProxy evaluation enqueue failed', e);
                }
                res.json({
                    id: raw?.id ?? null,
                    model: candidate,
                    output,
                    meta: metaOut,
                    raw,
                });
                return;
            }
            catch (innerErr) {
                lastFailure = innerErr;
                firebase_functions_1.logger.error('openrouterProxy candidate error:', innerErr);
                continue;
            }
        }
        firebase_functions_1.logger.error('openrouterProxy: all model candidates failed', lastFailure);
        res.status(502).json({
            error: 'OpenRouter error - all model candidates failed',
            lastFailure,
        });
    }
    catch (err) {
        firebase_functions_1.logger.error('openrouterProxy error:', err);
        res.status(500).json({ error: 'Internal server error', message: err?.message ?? String(err) });
    }
});
