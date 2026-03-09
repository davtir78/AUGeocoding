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

import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import cors from 'cors';
import admin from 'firebase-admin';

// Initialize Firebase Admin (idempotent)
if (!admin.apps?.length) {
  admin.initializeApp();
}
const firestore = admin.firestore();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

if (!OPENROUTER_API_KEY) {
  logger.warn(
    'OPENROUTER_API_KEY not found in environment. Set it with `firebase functions:env:set OPENROUTER_API_KEY="..."`'
  );
}

// OpenRouter chat endpoint
const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

import { getEvaluationResult } from './evalHelper';
import { callOpenRouterAPI } from './lib/openrouter';

/**
 * Server-side debug helpers — gate noisy logs behind OPENROUTER_DEBUG or DEBUG env flags.
 */
function isDebugEnabled(): boolean {
  try {
    const v = String(process.env.OPENROUTER_DEBUG ?? process.env.DEBUG ?? '').toLowerCase();
    return v === '1' || v === 'true';
  } catch {
    return false;
  }
}
const _dbg = isDebugEnabled();
function dbgLog(...args: any[]) {
  if (!_dbg) return;
  logger.log(...args);
}
function dbgWarn(...args: any[]) {
  if (!_dbg) return;
  logger.warn(...args);
}
function dbgError(...args: any[]) {
  if (!_dbg) return;
  logger.error(...args);
}

export const openrouterProxy = onRequest(
  {
    region: 'australia-southeast1',
    cors: true,
    secrets: ['OPENROUTER_API_KEY']
  },
  async (req, res) => {
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
        const evalResult = await getEvaluationResult(answerText, ctxText);
        res.json({ evaluation: evalResult });
      } catch (e) {
        logger.error('Evaluation endpoint error', e);
        res.status(500).json({ error: 'Evaluation failed', message: String(e) });
      }
      return;
    }

    // DEBUG LOG (dev-only)
    try {
      const isDev = process.env.NODE_ENV !== 'production';
      if (isDev) {
        logger.log('openrouterProxy request:', {
          model: model ?? null,
          promptPreview: typeof prompt === 'string' ? prompt.slice(0, 300) : null,
          messagesPreview: messages ? `Array of ${messages.length} messages` : null,
          max_tokens: max_tokens ?? null,
          temperature: typeof temperature === 'number' ? temperature : null,
          meta: meta ?? null,
        });
      }
    } catch (e) {
      logger.error('openrouterProxy logging error', e);
    }

    if (!model || (!prompt && !messages && !meta?.image_url)) {
      res.status(400).json({ error: 'Missing required fields: model and (prompt, messages, or meta.image_url for vision).' });
      return;
    }

    try {
      const candidates: string[] = Array.isArray(model) ? model : [model];
      let lastFailure: any = null;

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
            logger.info(`Constructed vision messages for model ${candidate} with image_url`);
          } else if (messages && Array.isArray(messages) && messages.length > 0) {
            openRouterMessages = messages;
          } else if (prompt) {
            openRouterMessages = [{ role: 'user', content: prompt }];
          } else {
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
          const raw = await callOpenRouterAPI(payload);

          // DEBUG LOG
          try {
            logger.log('openrouterProxy provider response preview:', {
              candidate,
              id: raw?.id ?? null,
              usage: raw?.usage ?? null,
              choicesPreview: raw?.choices
                ? raw.choices.map((c: any) => {
                  const text = c?.message?.content ?? c?.text ?? '';
                  return String(text).slice(0, 200);
                })
                : null,
            });
          } catch (e) {
            logger.error('openrouterProxy provider logging error', e);
          }

          let output = '';
          if (raw?.choices?.[0]?.message?.content) {
            output = raw.choices[0].message.content;
          } else if (raw?.choices?.[0]?.text) {
            output = raw.choices[0].text;
          } else if (raw?.output) {
            output = raw.output;
          } else {
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
                  ? raw.choices.map((c: any) => {
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
          } catch (e) {
            logger.warn('openrouterProxy telemetry write failed', e);
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
          } catch (e) {
            logger.warn('openrouterProxy evaluation enqueue failed', e);
          }

          res.json({
            id: raw?.id ?? null,
            model: candidate,
            output,
            meta: metaOut,
            raw,
          });
          return;
        } catch (innerErr: any) {
          lastFailure = innerErr;
          logger.error('openrouterProxy candidate error:', innerErr);
          continue;
        }
      }

      logger.error('openrouterProxy: all model candidates failed', lastFailure);
      res.status(502).json({
        error: 'OpenRouter error - all model candidates failed',
        lastFailure,
      });
    } catch (err: any) {
      logger.error('openrouterProxy error:', err);
      res.status(500).json({ error: 'Internal server error', message: err?.message ?? String(err) });
    }
  }
);
