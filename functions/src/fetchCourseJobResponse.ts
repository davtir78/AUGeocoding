import { logger } from 'firebase-functions/v2';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import admin from 'firebase-admin';
import { callOpenRouterWithFallback } from './lib/openrouter';
import { LessonDraftSchema } from './lib/schemas';

// Initialize Firebase Admin (idempotent, shared across functions)
if (!admin.apps?.length) {
  admin.initializeApp();
}
const db = admin.firestore();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Simple default model for course generation via OpenRouter.
// You can change this to your preferred model identifier.
const DEFAULT_COURSE_MODEL = 'openai/gpt-4.1-mini';

interface GenerationJobInput {
  topic?: string;
  subject?: string;
  gradeLevel?: string;
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  model?: string;
  numQuestions?: number;
  // Extended fields for legacy parity
  title?: string;
  description?: string;
  questionType?: 'mix' | 'multiple-choice' | 'true-false' | 'short-answer';
  additionalPrompt?: string;
  ageGroup?: string;
  preferredModels?: string[];
  presentationModels?: string[];
  presentationTextModels?: string[];
  quizModels?: string[];
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
 *  - When a new job of type 'course' with status 'queued' is created:
 *    - Marks it as 'fetching'
 *    - Calls OpenRouter to generate a structured course outline
 *    - Stores the raw JSON response text in job.rawContent
 *    - Marks status 'fetched' on success, or 'fetch_failed' on error
 */
export const fetchCourseJobResponse = onDocumentCreated(
  {
    document: 'generationJobs/{jobId}',
    region: 'australia-southeast1',
    secrets: ['OPENROUTER_API_KEY'],
    // NOTE: Event-triggered Gen 2 functions cannot exceed 540 seconds
    timeoutSeconds: 540,
  },
  async (event) => {
    const snapshot = event.data;
    const jobId = event.params.jobId;

    if (!snapshot) {
      logger.error('[fetchCourseJobResponse] No snapshot provided for job:', jobId);
      return;
    }

    const job = snapshot.data() as GenerationJobDoc | undefined;
    if (!job) {
      logger.error('[fetchCourseJobResponse] Job data missing for job:', jobId);
      return;
    }

    logger.info('[fetchCourseJobResponse] Triggered for job:', jobId, 'data:', job);

    try {
      // Idempotency: Fetch fresh document using existing snapshot ref
      const currentSnap = await snapshot.ref.get();
      if (!currentSnap.exists) return;

      const freshJob = currentSnap.data() as any;

      if (freshJob.type !== 'course') {
        logger.info('[fetchCourseJobResponse] Skipping job (not type=course):', jobId, freshJob.type);
        return;
      }

      if (freshJob.status !== 'queued') {
        logger.info(
          '[fetchCourseJobResponse] Skipping job (status not queued - IDEMPOTENCY):',
          jobId,
          freshJob.status
        );
        return;
      }

      if (!OPENROUTER_API_KEY) {
        logger.error(
          '[fetchCourseJobResponse] OPENROUTER_API_KEY is not set in environment. Cannot call OpenRouter.'
        );
        await snapshot.ref.update({
          status: 'fetch_failed',
          error: 'Server misconfiguration: OPENROUTER_API_KEY not set.',
          updatedAt: new Date(),
        });
        return;
      }

      const { topic, subject, gradeLevel, difficulty, model, preferredModels, numQuestions, title, description, questionType, additionalPrompt, ageGroup } = freshJob.input || {};
      if (!topic || !topic.trim()) {
        logger.error('[fetchCourseJobResponse] Missing or invalid topic in job:', jobId);
        await snapshot.ref.update({
          status: 'fetch_failed',
          error: 'Invalid job input: topic is required.',
          updatedAt: new Date(),
        });
        return;
      }

      const trimmedTopic = topic.trim();
      // Prioritize list (preferredModels) over single (model) over DEFAULT
      const modelToUse = (preferredModels && preferredModels.length > 0) ? preferredModels : (model || DEFAULT_COURSE_MODEL);
      const questionsPerSection = numQuestions || 3;
      const selectedQuestionType = questionType || 'mix';


      // ... (imports remain)

      const systemPrompt = `
You are an expert curriculum designer creating a detailed structured course outline for K-12 learners.

Target Age Group: ${ageGroup || 'late-primary'}
Ensure all content, examples, and vocabulary are appropriate for this age group.

Rules:
- Generate a high-quality OUTLINE only. No full content is needed yet.
- "summary": A detailed paragraph describing what this section covers. This will be used by an AI Presentation Generator to create slides, so be descriptive.
- "learningObjectives": 3-5 clear bullet points.
- Use 4-8 sections for a comprehensive topic.
${additionalPrompt ? `- Additional Instructions: ${additionalPrompt}` : ''}
`.trim();

      const userPrompt = `
Create a course:
Topic: "${trimmedTopic}"
${title ? `Course Title: "${title}"` : ''}
${description ? `Course Description: "${description}"` : ''}
Subject: "${subject || 'General'}"
Grade level: "${gradeLevel || 'mixed'}"
Difficulty: "${difficulty || 'beginner'}"
`.trim();

      logger.info('[fetchCourseJobResponse] Starting OpenRouter call for job:', jobId, {
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
        logger.warn('[fetchCourseJobResponse] Failed to update job to fetching (race condition?):', jobId, e);
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
            temperature: 0.4,
            max_tokens: 3000,
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: 'lesson_draft',
                strict: true,
                schema: LessonDraftSchema
              }
            }
          }
        );

        contentText = response.choices?.[0]?.message?.content || "";
        if (!contentText) {
          throw new Error('No content returned from OpenRouter.');
        }

      } catch (e: any) {
        logger.error('[fetchCourseJobResponse] All models failed:', e);
        await snapshot.ref.update({
          status: 'fetch_failed',
          error: `FetchV2 Error: ${e.message}`,
          updatedAt: new Date(),
        });
        return;
      }

      logger.info('[fetchCourseJobResponse] Received course JSON text length:', contentText.length);

      await snapshot.ref.update({
        status: 'fetched',
        rawContent: contentText,
        fetchCompletedAt: new Date(),
        updatedAt: new Date(),
      });

      logger.info('[fetchCourseJobResponse] Job marked as fetched:', jobId);
    } catch (err: any) {
      logger.error('[fetchCourseJobResponse] Unexpected error:', jobId, err);
      try {
        await snapshot.ref.update({
          status: 'fetch_failed',
          error: `FetchV2 Unexpected: ${err.message}`,
          updatedAt: new Date(),
        });
      } catch (innerErr) {
        logger.error('[fetchCourseJobResponse] Failed to set error status:', jobId, innerErr);
      }
    }

  }
);
