import { logger } from 'firebase-functions/v2';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import admin from 'firebase-admin';
import { callOpenRouterWithFallback } from './lib/openrouter';

// Initialize Firebase Admin (idempotent, shared across functions)
if (!admin.apps?.length) {
    admin.initializeApp();
}

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Simple default model for quiz generation via OpenRouter.
const DEFAULT_QUIZ_MODEL = 'openai/gpt-4o-mini';

interface GenerationJobInput {
    topic?: string;
    numQuestions?: number;
    difficulty?: 'beginner' | 'intermediate' | 'advanced';
    model?: string;
    ageGroup?: string;
    preferredModels?: string[];
    knowledgeItems?: any[]; // For 1-to-1 revision mapping
    subject?: string;
    yearLevel?: string;
}

interface GenerationJobDoc {
    userId: string;
    type: string;
    status: string;
    input: GenerationJobInput;
    error?: string | null;
    rawContent?: string;
    createdAt?: FirebaseFirestore.Timestamp;
    updatedAt?: FirebaseFirestore.Timestamp;
    fetchStartedAt?: FirebaseFirestore.Timestamp;
    fetchCompletedAt?: FirebaseFirestore.Timestamp;
}

/**
 * Firestore trigger:
 *  - Watches generationJobs/{jobId} documents
 *  - When a new job of type 'revision_quiz' with status 'queued' is created:
 *    - Marks it as 'fetching'
 *    - Calls OpenRouter to generate a structured quiz
 *    - Stores the raw JSON response text in job.rawContent
 *    - Marks status 'fetched' on success (triggers processGenerationJobs)
 */
export const fetchRevisionQuizJobResponse = onDocumentCreated(
    {
        document: 'generationJobs/{jobId}',
        region: 'australia-southeast1',
        secrets: ['OPENROUTER_API_KEY'],
        timeoutSeconds: 300,
    },
    async (event) => {
        const snapshot = event.data;
        const jobId = event.params.jobId;

        if (!snapshot) {
            logger.error('[fetchRevisionQuizJobResponse] No snapshot provided for job:', jobId);
            return;
        }

        const job = snapshot.data() as GenerationJobDoc | undefined;
        if (!job) {
            logger.error('[fetchRevisionQuizJobResponse] Job data missing for job:', jobId);
            return;
        }

        if (job.type !== 'revision_quiz' && job.type !== 'section-quiz') {
            // Quietly return for other job types to avoid log noise
            return;
        }

        logger.info('[fetchRevisionQuizJobResponse] Triggered for job:', jobId, 'data:', job);

        if (job.status !== 'queued') {
            logger.info(
                '[fetchRevisionQuizJobResponse] Skipping job (status not queued):',
                jobId,
                job.status
            );
            return;
        }

        if (!OPENROUTER_API_KEY) {
            logger.error(
                '[fetchRevisionQuizJobResponse] OPENROUTER_API_KEY is not set in environment. Cannot call OpenRouter.'
            );
            await snapshot.ref.update({
                status: 'fetch_failed',
                error: 'Server misconfiguration: OPENROUTER_API_KEY not set.',
                updatedAt: new Date(),
            });
            return;
        }

        const { topic, numQuestions, difficulty, model, preferredModels, ageGroup, knowledgeItems, subject, yearLevel } = job.input || {};
        const hasKnowledgeItems = Array.isArray(knowledgeItems) && knowledgeItems.length > 0;

        if ((!topic || !topic.trim()) && !hasKnowledgeItems) {
            logger.error('[fetchRevisionQuizJobResponse] Missing or invalid topic/items in job:', jobId);
            await snapshot.ref.update({
                status: 'fetch_failed',
                error: 'Invalid job input: topic or knowledgeItems required.',
                updatedAt: new Date(),
            });
            return;
        }

        const trimmedTopic = topic ? topic.trim() : 'Revision Quest';
        const count = numQuestions || (hasKnowledgeItems ? knowledgeItems.length : 10);
        const modelToUse = (preferredModels && preferredModels.length > 0) ? preferredModels : (model || DEFAULT_QUIZ_MODEL);

        const isSectionQuiz = job.type === 'section-quiz';

        // START PROMPT CONSTRUCTION
        let systemInstructions = '';
        let userInstructions = '';

        if (hasKnowledgeItems) {
            // --- 1-to-1 MAPPING MODE ---
            const itemContexts = knowledgeItems.map((item: any, i: number) => {
                return `Item ${i + 1} (SourceID: ${item.id}): ${item.extracted_text || item.text || 'Unknown Content'}`;
            }).join('\n\n');

            systemInstructions = `
You are an expert tutor creating a remedial revision quiz.
Subject Area: ${subject || 'General'}
Year Level: ${yearLevel || 'Unknown'}

I will provide a list of specific questions the student answered incorrectly ("Source Items").
For each Source Item, generate EXACTLY ONE new question that tests the SAME concept but with different numbers or context.
This is a 1-to-1 mapping.

Return ONLY valid JSON with this shape:
{
  "title": "Revision Quest",
  "description": "Targeted practice for your identified gaps.",
  "questions": [
    {
      "text": string,
      "type": "multiple-choice",
      "options": string[],
      "correctAnswer": string,
      "explanation": string,
      "source_item_id": string  // CRITICAL: MUST MATCH THE SourceID provided
    }
  ]
}

Rules:
- Generate exactly ${count} questions (one for each input item).
- "source_item_id" must copy the ID from the input exactly.
- Questions must be 4-option Multiple Choice.
- No markdown, no trailing commas.
`.trim();

            userInstructions = `
Here are the items to revise:

${itemContexts}

Generate the quiz now.
`.trim();

        } else {
            // --- STANDARD TOPIC MODE ---
            systemInstructions = `
You are an expert tutor creating a ${isSectionQuiz ? 'short quiz for a specific course section' : 'revision quiz'}.
Subject Area: ${subject || 'General'}
Target Age Group: ${ageGroup || 'late-primary'}
Year Level: ${yearLevel || 'Unknown'}

Ensure all questions, options, and explanations are appropriate for this age group and subject.
Return ONLY valid JSON (no markdown, no commentary) with the following shape:

{
  "title": string,
  "description": string,
  "deepDive": {
      "summary": string,
      "keyConcepts": [
          { "name": string, "explanation": string }
      ]
  },
  "questions": [
    {
      "text": string,
      "type": "multiple-choice" | "true-false",
      "options": string[] | null,
      "correctAnswer": string,
      "explanation": string
    }
  ]
}

Rules:
- **"title"**: A catchy, relevant title for the quiz.
- **"description"**: A short 1-sentence hook.
- **"deepDive"**:
    - "summary": A 2-3 paragraph detailed explanation of the topic, suitable for revision before the quiz.
    - "keyConcepts": Extract 3-5 core concepts/definitions that are crucial to the topic.
- Generate exactly ${count} questions.
- ${isSectionQuiz ? 'Questions must be directly answerable from the provided section content.' : 'Questions should cover key concepts of the topic.'}
- Mix question types: Use mostly **multiple-choice** (approx 70%) and **true-false** (approx 30%).
- **DO NOT generate short-answer questions.**
- For multiple-choice, provide 4 options.
- For true-false, provide options ["True", "False"].
- "correctAnswer" must directly match one of the options.
- Do not include any backticks or markdown fences.
- Do not include trailing commas. Ensure the JSON parses cleanly.
`.trim();

            userInstructions = isSectionQuiz ? `
Create a quiz based on this content:
"${trimmedTopic}"

Difficulty: "${difficulty || 'beginner'}"
Number of Questions: ${count}
        `.trim() : `
Create a revision quiz for:
Topic: "${trimmedTopic}"
Difficulty: "${difficulty || 'beginner'}"
Number of Questions: ${count}
`.trim();
        }

        const systemPrompt = systemInstructions;
        const userPrompt = userInstructions;

        logger.info('[fetchRevisionQuizJobResponse] Starting OpenRouter call for job:', jobId, {
            model: modelToUse,
            topic: trimmedTopic,
        });

        try {
            await snapshot.ref.update({
                status: 'fetching',
                fetchStartedAt: new Date(),
                updatedAt: new Date(),
            });
        } catch (e: any) {
            logger.error('[fetchRevisionQuizJobResponse] Failed to update job to fetching:', jobId, e);
            return;
        }

        let contentText = '';

        try {
            const models = Array.isArray(modelToUse) ? modelToUse : [modelToUse];

            const response = await callOpenRouterWithFallback(
                models,
                [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                {
                    temperature: 0.5,
                    max_tokens: 4000
                }
            );

            contentText = response.choices?.[0]?.message?.content || "";
            if (!contentText) {
                throw new Error('No content returned from OpenRouter.');
            }

        } catch (e: any) {
            logger.error('[fetchRevisionQuizJobResponse] All models failed:', e);
            await snapshot.ref.update({
                status: 'fetch_failed',
                error: `OpenRouter error: ${e.message}`,
                updatedAt: new Date(),
            });
            return;
        }

        logger.info('[fetchRevisionQuizJobResponse] Received JSON text length:', contentText.length);

        await snapshot.ref.update({
            status: 'fetched', // This will trigger processGenerationJobs
            rawContent: contentText,
            fetchCompletedAt: new Date(),
            updatedAt: new Date(),
        });

        logger.info('[fetchRevisionQuizJobResponse] Job marked as fetched:', jobId);

    }
);
