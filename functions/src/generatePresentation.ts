import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import admin from 'firebase-admin';

// Initialize Firebase Admin (idempotent)
if (!admin.apps?.length) {
  admin.initializeApp();
}
const db = admin.firestore();

interface GeneratePresentationData {
  title: string;
  slideCount: number;
  theme: string;
}

interface Slide {
  html: string;
  imageUrl?: string;
}

export const generatePresentationHttp = onRequest(
  { 
    region: 'australia-southeast1',
    cors: true,
    secrets: ['OPENROUTER_API_KEY']
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

    logger.info('[DEBUG] generatePresentation called');
    logger.info('[DEBUG] Request body:', req.body);
    logger.info('[DEBUG] Authorization header:', req.headers.authorization);

    // Verify Firebase ID token
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      logger.error('[DEBUG] Missing or invalid authorization header');
      res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
      return;
    }

    let uid: string;
    try {
      const idToken = authHeader.split('Bearer ')[1];
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      uid = decodedToken.uid;
      logger.info('[DEBUG] Successfully verified token for user:', uid);
    } catch (error) {
      logger.error('[DEBUG] Token verification failed:', error);
      res.status(401).json({ error: 'Unauthorized: Invalid token' });
      return;
    }

    // Parse request body
    const { title, slideCount, theme } = req.body || {};
    logger.info('[DEBUG] Parsed data:', { title, slideCount, theme });

    // Validation
    if (!title || typeof slideCount !== 'number' || slideCount < 1 || slideCount > 20 || !theme) {
      logger.error('[DEBUG] Validation failed:', { 
        hasTitle: !!title, 
        slideCountType: typeof slideCount, 
        slideCountValue: slideCount, 
        hasTheme: !!theme 
      });
      res.status(400).json({ 
        error: 'Invalid input: title, slideCount (1-20), and theme are required.' 
      });
      return;
    }

    logger.info('[DEBUG] Validation passed, creating presentation document');
    
    // Create presentation document with 'generating' status and return immediately
    const presentationRef = db.collection('presentations').doc();
    const presentationData = {
      userId: uid,
      title,
      slideCount,
      theme,
      createdAt: new Date(),
      status: 'generating',
      slides: [],
    };
    
    logger.info('[DEBUG] Presentation data to save:', presentationData);
    await presentationRef.set(presentationData);

    logger.info(`[DEBUG] Created presentation ${presentationRef.id} for user ${uid} - background processing will start`);
    
    // Return immediately - background trigger will handle the AI generation
    const result = { id: presentationRef.id };
    logger.info('[DEBUG] Returning result:', result);
    res.json(result);
  }
);
