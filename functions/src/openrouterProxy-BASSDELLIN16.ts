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

import cors from 'cors'; // Import the cors package as default
import type { Request, Response } from 'express';
import admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';

// Initialize Firebase Admin (idempotent)
if (!admin.apps?.length) {
  admin.initializeApp();
}
const firestore = admin.firestore();

// NOTE: Modern Node runtimes in Cloud Functions support global fetch. If your runtime does not,
// you may need to install 'node-fetch' or 'undici' as a dependency and import it here.

// OpenRouter chat endpoint (shared)
const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

const corsHandler = cors({ origin: true }); // Configure CORS to allow all origins for now

import { getEvaluationResult } from './evalHelper';

/**
 * Server-side debug helpers — gate noisy logs behind OPENROUTER_DEBUG or DEBUG env flags.
 * Set OPENROUTER_DEBUG=1 or DEBUG=1 to enable verbose logs from this function.
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
  try {
    // eslint-disable-next-line no-console
    console.log(...args);
  } catch {}
}
function dbgWarn(...args: any[]) {
  if (!_dbg) return;
  try {
    // eslint-disable-next-line no-console
    console.warn(...args);
  } catch {}
}
function dbgError(...args: any[]) {
  if (!_dbg) return;
  try {
    // eslint-disable-next-line no-console
    console.error(...args);
  } catch {}
}

export const openrouterProxy = onRequest(
  { 
    secrets: ['OPENROUTER_API_KEY'], // Use the exact secret name
    region: 'us-central1'
  },
  (req: Request, res: Response) => {
    // Handle CORS pre‑flight (OPTIONS) requests
    if (req.method === 'OPTIONS') {
      // Respond to the pre‑flight request with the required CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
      res.setHeader('Access-Control-Max-Age', '86400');
      res.status(204).send('');
      return;
    }

    // For actual POST requests, continue using the existing CORS handler
    corsHandler(req, res, async () => {
      // Ensure every response (success or error) includes the CORS header
      res.setHeader('Access-Control-Allow-Origin', '*');
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed. Use POST.' });
        return;
      }

      const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY; // Access inside the handler

      if (!OPENROUTER_API_KEY) {
        console.error('Server misconfiguration: OPENROUTER_API_KEY not set in environment.');
        res.status(500).json({ error: 'Server misconfiguration: OPENROUTER_API_KEY not set.' });
        return;
      }

      const body = req.body || {};
      const { model, prompt, max_tokens, temperature, meta, action, studentAnswer, context } = body;

      // Dedicated evaluation action:
      // Clients may POST { action: 'evaluate', studentAnswer, context? } to receive a JSON evaluation:
      // { evaluation: { score, feedback, confidence } }
      if (action === 'evaluate') {
        try {
          const answerText = String(studentAnswer ?? prompt ?? '');
          const ctxText = String(context ?? '');
          const evalResult = await getEvaluationResult(answerText, ctxText);
          res.json({ evaluation: evalResult });
        } catch (e) {
          console.error('Evaluation endpoint error', e);
          res.status(500).json({ error: 'Evaluation failed', message: String(e) });
        }
        return;
      }

      // DEBUG LOG: record incoming request details for troubleshooting (model, prompt summary, meta)
      try {
        console.log('openrouterProxy request:', {
          model: model ?? null,
          promptPreview: typeof prompt === 'string' ? prompt.slice(0, 300) : null,
          max_tokens: max_tokens ?? null,
          temperature: typeof temperature === 'number' ? temperature : null,
          meta: meta ?? null,
        });
      } catch (e) {
        // ensure logging never throws
        console.error('openrouterProxy logging error', e);
      }

      if (!model || !prompt) {
        res.status(400).json({ error: 'Missing required fields: model and prompt.' });
        return;
      }

      try {
        // OpenRouter Chat Completions endpoint.
        // This server-side implementation supports a prioritized array of candidate models.
        // If `model` is an array, we'll try each candidate in order until one succeeds.
        // Adjust path if using a different OpenRouter product (images, embeddings, etc.)
        const openRouterUrl = 'https://openrouter.ai/api/v1/chat/completions';

        const candidates: string[] = Array.isArray(model) ? model : [model];
        let lastFailure: any = null;

        // DEBUG LOG: record incoming payload for multimodal/vision troubleshooting
        try {
          console.log('openrouterProxy incoming body preview:', {
            model: model ?? null,
            hasMessages: Boolean(body.messages),
            messagesPreview: body.messages ? JSON.stringify(body.messages, null, 2).slice(0, 500) : null,
            promptPreview: typeof prompt === 'string' ? prompt.slice(0, 300) : null,
            mode: body.mode ?? null,
          });
        } catch (e) {
          console.error('openrouterProxy body logging error', e);
        }

        for (const candidate of candidates) {
          try {
            const payload: any = {
              model: candidate,
              max_tokens: max_tokens ?? 512,
              temperature: typeof temperature === 'number' ? temperature : 0.2,
            };

            // Preserve incoming messages if provided (for multimodal/vision requests)
            if (body.messages) {
              payload.messages = body.messages;
            } else {
              // Fallback to simple prompt-based message for text-only requests
              payload.messages = [{ role: 'user', content: prompt }];
            }

            // Debug: log which candidate is being tried
            try {
              console.log('openrouterProxy: trying model candidate ->', candidate);
              console.log('openrouterProxy: forwarding payload preview ->', JSON.stringify(payload, null, 2).slice(0, 800));
            } catch (e) {
              /* ignore */
            }

            const resp = await fetch(openRouterUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${OPENROUTER_API_KEY}`,
              },
              body: JSON.stringify(payload),
            });

            const raw = await resp.json() as any;

            // DEBUG LOG: brief provider response preview for troubleshooting
            try {
              console.log('openrouterProxy provider response preview:', {
                candidate,
                status: resp.status,
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
              console.error('openrouterProxy provider logging error', e);
            }

            if (!resp.ok) {
              // record failure and try next candidate
              lastFailure = { status: resp.status, provider: raw };
              console.warn('openrouterProxy: candidate failed, trying next ->', candidate, resp.status);
              continue;
            }

            // Basic normalization: attempt to extract text output. OpenRouter provider responses vary.
            // Prioritize content from choices array (OpenAI-style), then 'output' field, then raw JSON.
            let output = '';
            if (raw?.choices?.[0]?.message?.content) {
              output = raw.choices[0].message.content;
            } else if (raw?.choices?.[0]?.text) {
              output = raw.choices[0].text;
            } else if (raw?.output) {
              output = raw.output;
            } else {
              // Fallback to stringifying the whole raw response if no specific output field is found
              output = JSON.stringify(raw);
            }

            // Basic metadata - placeholder for tokens_est and cost estimation
            const metaOut = {
              model_used: candidate,
              tokens_est: raw?.usage ?? null,
              request_meta: meta ?? null,
            };

            // Server-side telemetry (fire-and-forget): write a small, redacted event to Firestore.
            try {
              const telemetryPayload = {
                eventType: 'openrouter.response',
                timestamp: Date.now(),
                source: 'server',
                payload: {
                  model_requested: model,
                  model_used: candidate,
                  id: raw?.id ?? null,
                  // shallow preview of choices (avoid storing full content)
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
              // Fire and forget; do not await to avoid blocking response
              firestore.collection('analytics_events').add(telemetryPayload).catch(() => {});
            } catch (e) {
              try {
                console.warn('openrouterProxy telemetry write failed', e);
              } catch {}
            }

            // Optional: enqueue an evaluation request if requested in meta or enabled via env
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
                firestore.collection('analytics_events').add(evalEvent).catch(() => {});
              }
            } catch (e) {
              try {
                console.warn('openrouterProxy evaluation enqueue failed', e);
              } catch {}
            }

            // Successful response — return to client
            res.json({
              id: raw?.id ?? null,
              model: candidate,
              output,
              meta: metaOut,
              raw,
            });
            return;
          } catch (innerErr: any) {
            // network or unexpected error for this candidate — record and try next
            lastFailure = innerErr;
            console.error('openrouterProxy candidate error:', innerErr);
            continue;
          }
        }

        // If we reach here, no candidate succeeded
        console.error('openrouterProxy: all model candidates failed', lastFailure);
        res.status(502).json({
          error: 'OpenRouter error - all model candidates failed',
          lastFailure,
        });
      } catch (err: any) {
        console.error('openrouterProxy error:', err);
        res.status(500).json({ error: 'Internal server error', message: err?.message ?? String(err) });
      }
    });
  }
);
