/**
 * evalHelper.ts
 *
 * Helper that provides getEvaluationResult used by the functions openrouterProxy.
 * Kept in its own file so it can be unit-tested in isolation.
 */

const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

/**
 * Evaluate an AI response using an evaluation prompt.
 * Attempts to ask the provider to return a strict JSON object: { score, feedback, confidence }.
 * Returns an object with fallback values if parsing or provider call fails.
 */
export async function getEvaluationResult(
  responseText: string,
  contextText?: string
): Promise<{ score: number; feedback: string; confidence: number }> {
  const evalModel = String(process.env.OPENROUTER_EVAL_MODEL ?? 'gpt-4o-mini');

  const evalInstruction = `
You are an objective evaluator. Given the QUESTION (or context) and the STUDENT_ANSWER, return a JSON object with exactly these fields:
{
  "score": number,
  "feedback": string,
  "confidence": number
}

QUESTION / CONTEXT:
${String(contextText ?? '').trim()}

STUDENT_ANSWER:
${String(responseText ?? '').trim()}

Return ONLY valid JSON (no surrounding explanation). If you cannot parse the answer, set score to 0 and provide a short feedback message.
`.trim();

  try {
    const payload = {
      model: evalModel,
      messages: [
        { role: 'system', content: 'You are a strict JSON responder for evaluations.' },
        { role: 'user', content: evalInstruction },
      ],
      max_tokens: 300,
      temperature: 0.0,
    };

    const resp = await fetch(OPENROUTER_CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: OPENROUTER_API_KEY ? `Bearer ${OPENROUTER_API_KEY}` : '',
      },
      body: JSON.stringify(payload),
    });

    const raw = (await resp.json().catch(() => null)) as any;
    let candidateText = '';

    if (raw?.choices?.[0]?.message?.content) {
      candidateText = raw.choices[0].message.content;
    } else if (raw?.choices?.[0]?.text) {
      candidateText = raw.choices[0].text;
    } else if (typeof raw === 'string') {
      candidateText = raw;
    } else {
      candidateText = JSON.stringify(raw ?? {});
    }

    const jsonMatch = candidateText.match(/\{[\s\S]*\}/);
    const jsonText = jsonMatch ? jsonMatch[0] : candidateText;

    try {
      const parsed = JSON.parse(jsonText);
      const score = typeof parsed.score === 'number' ? Math.max(0, Math.min(1, parsed.score)) : 0;
      const feedback =
        typeof parsed.feedback === 'string'
          ? parsed.feedback
          : String(parsed.feedback ?? '').slice(0, 500) || 'No feedback provided.';
      const confidence = typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0;
      return { score, feedback, confidence };
    } catch (parseErr) {
      const numMatch = candidateText.match(/([01](?:\.\d+)?)/);
      const score = numMatch ? Math.max(0, Math.min(1, parseFloat(numMatch[1]))) : 0;
      const feedback = candidateText.replace(/\n/g, ' ').slice(0, 500) || 'Evaluation parsing failed.';
      return { score, feedback, confidence: 0 };
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('Evaluation request failed', err);
    return { score: 0, feedback: 'Evaluation service unavailable.', confidence: 0 };
  }
}
