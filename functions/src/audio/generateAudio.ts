import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';
import OpenAI from 'openai';

if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();
const storage = admin.storage();

interface GenerateAudioRequest {
    courseId?: string; // Optional: Generate for a whole course
    presentationId: string; // Required: The presentation to enhance
    slides: any[]; // The generic slide objects
    voice?: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer'; // OpenAI voices
}

// Map internal personas to OpenAI voices
const VOICE_MAP: Record<string, string> = {
    'study-buddy': 'nova',
    'headmaster': 'onyx',
    'bard': 'fable',
    'librarian': 'alloy',
    'mentor': 'echo',
    'orator': 'shimmer',
    // Direct mapping
    'nova': 'nova',
    'onyx': 'onyx',
    'fable': 'fable',
    'alloy': 'alloy',
    'echo': 'echo',
    'shimmer': 'shimmer'
};

export const generateAudio = onCall({
    region: 'australia-southeast1',
    timeoutSeconds: 300,
    memory: '512MiB',
    secrets: ['OPENAI_API_KEY'],

}, async (request) => {
    // 1. Authentication & Validation
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be logged in to generate audio.');
    }

    let { presentationId, slides, voice = 'alloy', courseId } = request.data as GenerateAudioRequest;

    if (!presentationId) {
        throw new HttpsError('invalid-argument', 'Missing presentationId.');
    }

    // Fetch slides if not provided
    if (!slides || !Array.isArray(slides) || slides.length === 0) {
        const presDoc = await db.collection('presentations').doc(presentationId).get();
        if (!presDoc.exists) {
            throw new HttpsError('not-found', 'Presentation not found.');
        }
        slides = presDoc.data()?.slides || [];
    }

    // Resolve voice persona
    const openAiVoice = VOICE_MAP[voice] || 'alloy';
    logger.info(`[Audio] Generating audio for ${presentationId} using voice: ${openAiVoice} (${voice})`);

    const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
    });

    // 2. Parallel Generation Loop
    try {
        const updatedSlides = await generateAudioForPresentation(presentationId, slides, openAiVoice as any);

        // 3. Update Firestore
        logger.info(`[Audio] Generated audio clips. Updating Firestore...`);

        await db.collection('presentations').doc(presentationId).update({
            slides: updatedSlides,
            audioStatus: 'completed', // New field to track readiness
            audioVoice: openAiVoice
        });

        // 4. Return success
        return {
            success: true,
            audioGeneratedCount: updatedSlides.filter(s => s.audioUrl).length,
            voice: openAiVoice
        };

    } catch (error: any) {
        logger.error('[Audio] Critical error in generateAudio', error);
        throw new HttpsError('internal', error.message || 'Failed to generate audio.');
    }
});

/**
 * Internal helper to generate audio for a set of slides.
 * Can be called by background triggers or other functions.
 */
export async function generateAudioForPresentation(
    presentationId: string,
    slides: any[],
    voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer'
): Promise<any[]> {
    const bucket = admin.storage().bucket();
    const updatedSlides = [...slides];
    const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
    });

    logger.info(`[AudioInternal] Starting generation for ${presentationId} with voice ${voice}`);
    logger.info(`[AudioInternal] Slides count: ${updatedSlides.length}. Sample script: ${updatedSlides[0]?.narrationScript?.slice(0, 50)}...`);

    const promises = updatedSlides.map(async (slide, index) => {
        // Skip if no script
        if (!slide.narrationScript) {
            logger.warn(`[AudioInternal] Slide ${index + 1} missing narrationScript. Skipping.`);
            return;
        }

        // Skip if already exists with same voice (simple check)
        // If the user requests a different voice, we should arguably force regen, 
        // but for this internal function we assume the caller knows what they want.
        if (slide.audioUrl && slide.audioVoice === voice) {
            return;
        }

        const slideId = slide.id || `slide-${index + 1}`;
        // Use a consistent naming convention
        const filePath = `audio/${presentationId}/${slideId}_${voice}.mp3`;
        const file = bucket.file(filePath);

        try {
            // Call OpenAI TTS
            logger.info(`[AudioInternal] Calling OpenAI for slide ${index + 1}`);
            const mp3 = await openai.audio.speech.create({
                model: 'tts-1',
                voice: voice,
                input: slide.narrationScript,
            });
            logger.info(`[AudioInternal] OpenAI response received for slide ${index + 1}`);

            const buffer = Buffer.from(await mp3.arrayBuffer());

            // Upload to Firebase
            await file.save(buffer, {
                contentType: 'audio/mpeg',
                metadata: {
                    metadata: {
                        presentationId,
                        slideId,
                        voice: voice,
                        generatedBy: 'system'
                    }
                }
            });

            // Make public
            await file.makePublic();

            // Update slide object
            slide.audioUrl = file.publicUrl();
            slide.audioVoice = voice;

        } catch (err: any) {
            logger.error(`[AudioInternal] Failed to generate/upload for slide ${index + 1}`, err);
            logger.error(`[AudioInternal] Error details:`, JSON.stringify(err));
            // Continue without failing the batch
        }
    });

    await Promise.all(promises);
    return updatedSlides;
}
