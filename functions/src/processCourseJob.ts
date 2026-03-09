import { logger } from 'firebase-functions/v2';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import admin from 'firebase-admin';

// Initialize Firebase Admin (idempotent, shared across functions)
if (!admin.apps?.length) {
  admin.initializeApp();
}
const db = admin.firestore();

interface GenerationJobInput {
  topic?: string;
  subject?: string;
  gradeLevel?: string;
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  model?: string;
  // Presentation preferences passing through
  slideCount?: number;
  theme?: string;
  presentationModels?: string[];
  presentationTextModels?: string[];
  quizModels?: string[];
  preferredModels?: string[];
  numQuestions?: number;
  autoGenerateAudio?: boolean;
  audioVoice?: string;
}

interface GenerationJobAfter {
  userId: string;
  type: string;
  status: string;
  input: GenerationJobInput;
  rawContent?: string;
  error?: string | null;
  knowledgeItemIds?: string[];
}

/**
 * Firestore trigger:
 *  - Watches generationJobs/{jobId} updates
 *  - When a 'course' job transitions to status 'fetched' (containing Outline JSON):
 *    - Creates Course Document
 *    - For each Section in Outline:
 *      * Creates a Presentation V2 Job (creates 'presentations' doc)
 *      * Creates a Section Quiz Job (creates 'generationJobs' doc with type 'section-quiz')
 *      * Creates Section Document linked to the above
 *    - Creates StudyAid
 *    - Marks job as completed
 */
export const processCourseJob = onDocumentUpdated(
  {
    document: 'generationJobs/{jobId}',
    region: 'australia-southeast1',
    timeoutSeconds: 540,
  },
  async (event) => {
    const before = event.data?.before;
    const after = event.data?.after;
    const jobId = event.params.jobId;

    if (!before || !after) return;

    try {
      const beforeData = before.data() as GenerationJobAfter | undefined;
      const afterData = after.data() as GenerationJobAfter | undefined;

      if (!beforeData || !afterData) return;

      if (afterData.type !== 'course') return;

      logger.info(`[processCourseJob] Incoming change for ${jobId}: ${beforeData.status} -> ${afterData.status}`);

      // Only act on transition to fetched
      if (beforeData.status === afterData.status || afterData.status !== 'fetched') return;

      logger.info('[processCourseJob] Processing fetched course job:', jobId);

      const rawContent = afterData.rawContent;
      if (!rawContent || typeof rawContent !== 'string') {
        await after.ref.update({
          status: 'failed',
          error: 'Missing rawContent for course processing.',
          updatedAt: new Date(),
          completedAt: new Date(),
        });
        return;
      }

      let parsed: any;
      try {
        parsed = tolerantJsonParse(rawContent);
      } catch (e: any) {
        logger.error('[processCourseJob] Failed to parse rawContent JSON:', e);
        await after.ref.update({
          status: 'failed',
          error: 'rawContent is not valid JSON.',
          updatedAt: new Date(),
          completedAt: new Date(),
        });
        return;
      }

      const userId = afterData.userId;
      const input = afterData.input || {};
      const title: string = parsed?.course?.title || input.topic || 'Generated Course';
      const description: string = parsed?.course?.description || input.topic || '';

      const sections: any[] = Array.isArray(parsed?.sections) ? parsed.sections : [];

      logger.info('[processCourseJob] Parsed sections count:', sections.length);

      // Create course document
      const courseRef = db.collection('courses').doc();
      const now = new Date();

      const courseDoc = {
        id: courseRef.id,
        title,
        description,
        creatorId: userId,
        sharing: 'private' as const,
        subject: input.subject || 'General',
        gradeLevel: input.gradeLevel ? [input.gradeLevel] : [],
        difficulty: input.difficulty || 'beginner',
        estimatedDuration: sections.length * 15, // rough estimate
        sectionCount: sections.length,
        questionCount: 0, // Will be updated as quizzes come in
        aiGenerated: true,
        aiModel: input.model || 'google/gemini-3-pro-preview',
        generationPrompt: input.topic || '',
        xpReward: 100,
        status: 'generating',
        createdAt: now,
        updatedAt: now,
        theme: {
          primaryColor: '#1f2933',
          secondaryColor: '#4b5563',
          backgroundStyle: 'parchment' as const,
        },
        ...(afterData.knowledgeItemIds ? { knowledgeItemIds: afterData.knowledgeItemIds } : {}) // Link Vault items if present
      };

      await courseRef.set(courseDoc);
      logger.info('[processCourseJob] Created course:', courseRef.id);

      // Process Sections
      for (let i = 0; i < sections.length; i++) {
        const sectionData = sections[i] || {};
        const sectionId = db.collection('courses').doc().id;
        const sectionRef = courseRef.collection('sections').doc(sectionId);

        const sectionTitle = sectionData.title || `Section ${i + 1}`;
        const sectionSummary = sectionData.summary || '';

        // 1. Kick off Presentation V2
        const presentationRef = db.collection('presentations').doc();
        const presentationDoc = {
          id: presentationRef.id,
          userId,
          title: sectionTitle,
          topic: `${sectionTitle}: ${sectionSummary}`,
          status: 'generating' as const,
          version: 'v2' as const,
          slideCount: input.slideCount || 5,
          theme: input.theme || 'modern',
          ageGroup: input.gradeLevel || 'mixed',
          additionalContext: `Part of course: ${title}`,
          createdAt: now,
          updatedAt: now,
          generationJobId: jobId,
          courseId: courseRef.id,
          sectionId: sectionId,
          // PASS THROUGH: Preferred models for presentation V2
          preferredModels: input.presentationModels || [],
          textModels: input.presentationTextModels || [],
          autoGenerateAudio: input.autoGenerateAudio || false,
          voice: input.audioVoice || 'alloy',
          visibility: 'hidden' // Hide from main dashboards
        };

        await presentationRef.set(presentationDoc);

        // 2. Kick off Section Quiz
        const quizJobRef = db.collection('generationJobs').doc();
        const quizJobDoc = {
          userId,
          type: 'section-quiz',
          status: 'queued',
          input: {
            topic: sectionSummary,
            subject: input.subject || 'General',
            gradeLevel: input.gradeLevel || 'mixed',
            difficulty: input.difficulty || 'beginner',
            courseId: courseRef.id,
            sectionId: sectionId,
            numQuestions: input.numQuestions || 3,
            // PASS THROUGH: Preferred models for section-quiz
            preferredModels: input.quizModels || []
          },
          visibility: 'hidden', // Hide from main dashboards
          createdAt: now,
          updatedAt: now
        };

        await quizJobRef.set(quizJobDoc);

        // 3. Create Section
        const sectionDoc = {
          id: sectionId,
          courseId: courseRef.id,
          title: sectionTitle,
          description: sectionSummary,
          order: i,
          // New V2 fields
          presentationId: presentationRef.id,
          quizJobId: quizJobRef.id,

          // Legacy fields for compatibility
          contentType: 'presentation' as const, // Changed from 'html'
          htmlContent: '',
          contentKind: 'presentation' as const,
          learningObjectives: sectionData.learningObjectives || [],

          aiGenerated: true,
          questionCount: 0, // Starts at 0, quiz job will update this
          createdAt: now,
          updatedAt: now,
        };

        await sectionRef.set(sectionDoc);
        logger.info(`[processCourseJob] Initialized Section ${i + 1}: ${sectionId} w/ Pres ${presentationRef.id} and QuizJob ${quizJobRef.id}`);
      }

      // Create StudyAid document
      const studyAidRef = db.collection('studyAids').doc();
      await studyAidRef.set({
        id: studyAidRef.id,
        userId,
        type: 'course',
        title,
        description,
        courseId: courseRef.id,
        status: 'generating',
        generatedBy: 'ai',
        createdAt: now,
        updatedAt: now,
      });

      // Complete the main job
      await after.ref.update({
        status: 'completed',
        courseId: courseRef.id,
        studyAidId: studyAidRef.id,
        updatedAt: new Date(),
        completedAt: new Date(),
      });
    } catch (err: any) {
      logger.error('[processCourseJob] Unexpected error:', jobId, err);
      try {
        await after.ref.update({
          status: 'failed',
          error: err.message || 'Unexpected internal error.',
          updatedAt: new Date(),
          completedAt: new Date(),
        });
      } catch (innerErr) {
        logger.error('[processCourseJob] Failed to set error status:', jobId, innerErr);
      }
    }
  }
);

function tolerantJsonParse(raw: string): any {
  let cleaned = raw.trim();
  if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
  else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
  if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
  cleaned = cleaned.replace(/^`+|`+$/g, '').trim();

  try { return JSON.parse(cleaned); } catch {
    const objectMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objectMatch) { try { return JSON.parse(objectMatch[0]); } catch { } }
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrayMatch) { try { return JSON.parse(arrayMatch[0]); } catch { } }
    throw new Error('Could not extract valid JSON from response');
  }
}

