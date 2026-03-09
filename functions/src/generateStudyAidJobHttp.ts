import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import admin from 'firebase-admin';

// Initialize Firebase Admin (idempotent, shared across functions)
if (!admin.apps?.length) {
  admin.initializeApp();
}
const db = admin.firestore();

type StudyAidJobType =
  | 'course'
  | 'revision_quiz'
  | 'html_note'
  | 'infographic'
  | 'presentation'
  | 'podcast'
  | 'video';

interface GenerateStudyAidJobRequest {
  type: StudyAidJobType;
  topic?: string;
  title?: string;
  subject?: string;
  gradeLevel?: string;
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  category?: string;
  tags?: string[];
  inputImageUrls?: string[];
  sourceText?: string;
  model?: string;
  // Presentation specific
  slideCount?: number;
  theme?: string;
  version?: 'v2';
  preferredModels?: string[];
  style?: string; // For Infographics
  ageGroup?: string;
  // Extended Presentation context
  language?: string;
  tone?: string;
  verbosity?: string;
  instructions?: string;
  additionalContext?: string;
  autoGenerateAudio?: boolean;
  voice?: string;
}

export const generateStudyAidJobHttp = onRequest(
  {
    region: 'australia-southeast1',
    cors: true,
  },
  async (req, res) => {
    // Handle OPTIONS pre-flight
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    // Only allow POST
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed. Use POST.' });
      return;
    }

    logger.info('[generateStudyAidJobHttp] Recieved request');

    // Verify Firebase ID token
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      logger.error('[generateStudyAidJobHttp] Missing or invalid authorization header');
      res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
      return;
    }

    let uid: string;
    try {
      const idToken = authHeader.split('Bearer ')[1];
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      uid = decodedToken.uid;
      logger.info('[generateStudyAidJobHttp] Verified user:', uid);
    } catch (error) {
      logger.error('[generateStudyAidJobHttp] Token verification failed:', error);
      res.status(401).json({ error: 'Unauthorized: Invalid token' });
      return;
    }

    const body = req.body || {};
    const {
      type,
      topic,
      title,
      subject,
      gradeLevel,
      difficulty,
      category,
      tags,
      inputImageUrls,
      sourceText,
      model,
    } = body;

    if (!type) {
      res.status(400).json({ error: 'Invalid input: type is required.' });
      return;
    }

    // Minimal validation rules by type.
    const needsTopicTypes: StudyAidJobType[] = [
      'course',
      'revision_quiz',
      'html_note',
      'infographic',
      'presentation',
    ];
    if (needsTopicTypes.includes(type) && (!topic || typeof topic !== 'string' || !topic.trim())) {
      logger.error(
        '[generateStudyAidJobHttp] Validation failed: missing or invalid topic for type',
        { type, topic }
      );
      res.status(400).json({
        error: 'Invalid input: topic is required for this study aid type.',
      });
      return;
    }

    if (type === 'presentation') {
      const { slideCount, theme } = body;
      if (!slideCount || typeof slideCount !== 'number' || slideCount < 1 || slideCount > 20 || !theme) {
        logger.error('[generateStudyAidJobHttp] Validation failed for presentation', { slideCount, theme });
        res.status(400).json({
          error: 'Invalid input: slideCount (1-20) and theme are required for presentations.',
        });
        return;
      }
    }

    if (difficulty && !['beginner', 'intermediate', 'advanced'].includes(difficulty)) {
      logger.error('[generateStudyAidJobHttp] Validation failed: invalid difficulty', { difficulty });
      res.status(400).json({
        error: 'Invalid input: difficulty must be one of beginner, intermediate, or advanced.',
      });
      return;
    }

    // Normalise input payload – this will be processed differently depending on type.
    const trimmedTopic = topic?.trim();
    const trimmedTitle = title?.trim();
    const jobInput: Partial<GenerateStudyAidJobRequest> = { type };

    if (trimmedTopic) jobInput.topic = trimmedTopic;
    if (trimmedTitle) jobInput.title = trimmedTitle;

    // Copy other fields if valid
    if (subject?.trim()) jobInput.subject = subject.trim();
    if (gradeLevel?.trim()) jobInput.gradeLevel = gradeLevel.trim();
    if (difficulty) jobInput.difficulty = difficulty;
    if (category?.trim()) jobInput.category = category.trim();

    if (type === 'presentation') {
      if (body.slideCount) jobInput.slideCount = body.slideCount;
      if (body.theme) jobInput.theme = body.theme;
      if (body.version) jobInput.version = body.version;
      if (body.autoGenerateAudio !== undefined) jobInput.autoGenerateAudio = body.autoGenerateAudio;
      if (body.voice) jobInput.voice = body.voice;
    }

    // Extended Context (Generic but mostly for presentation/course)
    if (body.language) jobInput.language = body.language;
    if (body.tone) jobInput.tone = body.tone;
    if (body.verbosity) jobInput.verbosity = body.verbosity;
    if (body.instructions) jobInput.instructions = body.instructions;
    if (body.additionalContext) jobInput.additionalContext = body.additionalContext;

    const normalizedTags =
      Array.isArray(tags) && tags.length
        ? tags.filter((tag: any): tag is string => Boolean(tag?.toString().trim()))
        : undefined;
    if (normalizedTags?.length) jobInput.tags = normalizedTags;

    const normalizedImages =
      Array.isArray(inputImageUrls) && inputImageUrls.length
        ? inputImageUrls.filter((url: any): url is string => Boolean(url?.toString().trim()))
        : undefined;
    if (normalizedImages?.length) jobInput.inputImageUrls = normalizedImages;

    if (sourceText?.trim()) jobInput.sourceText = sourceText.trim();
    if (model?.trim()) jobInput.model = model.trim();
    if (body.ageGroup?.trim()) jobInput.ageGroup = body.ageGroup.trim();

    // Specific mapping for Infographics
    if (type === 'infographic') {
      if (body.style) jobInput['style'] = body.style;
    }

    // Explicitly allow preferredModels array
    if (body.preferredModels && Array.isArray(body.preferredModels)) {
      jobInput.preferredModels = body.preferredModels;
    }

    logger.info('[generateStudyAidJobHttp] Validation passed, creating generationJobs document', {
      userId: uid,
      type,
      input: jobInput,
    });

    try {
      const jobRef = db.collection('generationJobs').doc();
      const now = new Date();

      const jobData = {
        userId: uid,
        type, // e.g. 'course', 'revision_quiz', 'html_note', ...
        input: jobInput,
        status: 'queued' as const,
        error: null as string | null,
        studyAidId: null as string | null,
        courseId: null as string | null,
        presentationId: null as string | null,
        quizQuestionIds: [] as string[],
        createdAt: now,
        updatedAt: now,
      };

      await jobRef.set(jobData);

      logger.info(
        `[generateStudyAidJobHttp] Created generationJobs/${jobRef.id} for user ${uid} (type=${type})`
      );

      res.json({ jobId: jobRef.id, type });
    } catch (e: any) {
      logger.error('[generateStudyAidJobHttp] Failed to create generation job', {
        error: e?.message,
        stack: e?.stack,
      });
      res.status(500).json({ error: 'Internal server error: could not create generation job.' });
    }
  }
);
