import { logger } from 'firebase-functions/v2';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

const secretManager = new SecretManagerServiceClient();
const db = getFirestore();
const storage = getStorage();

// --- CONFIGURATION ---
// Z.ai Agent ID from dashboard
const ZAI_AGENT_ID = 'slides_glm_agent';

// Timeout configurations (in milliseconds)
const API_TIMEOUT = 15 * 60 * 1000; // 15 minutes for Z.ai API call (Firebase Functions Gen 2 limit)
const FUNCTION_TIMEOUT = 20 * 60 * 1000; // 20 minutes total (Firebase Functions Gen 2 maximum)

// --- TYPES FOR SSE PARSING ---
interface StreamEvent {
  choices: Choice[];
  usage?: Usage;
  status?: string;
  error?: {
    code: string;
    message: string;
  };
}

interface Choice {
  index?: number;
  messages?: Message[];
  message?: Message;
  finish_reason?: string;
}

interface Message {
  role: string;
  content: Content | ContentObject[];
  phase?: 'thinking' | 'answer' | 'tool';
}

interface Content {
  type: string;
  text?: string;
  object?: ToolObject;
  tag_en?: string;
}

interface ContentObject {
  type: 'object';
  object: ToolObject;
  tag_cn: string;
  tag_en: string;
}

interface ToolObject {
  tool_name: string;
  input?: string;
  output?: any;
  position?: number[];
  title?: string;
}

interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface ExtractedSlide {
  position: number;
  title: string;
  html: string;
}

/* deepUnescape helper - safely reduces multiple layers of JSON-style escaping */
function deepUnescape(input: string, maxIterations = 5): string {
  if (typeof input !== 'string' || !/[\\][nr"']/.test(input)) return input;
  let s = input;
  for (let i = 0; i < maxIterations; i++) {
    const prev = s;
    s = s
      .replace(/\\\\r\\\\n/g, '\r\n')
      .replace(/\\\\n/g, '\\n')
      .replace(/\\r\\n/g, '\r\n')
      .replace(/\\n/g, '\n')
      .replace(/\\\\r/g, '\r')
      .replace(/\\r/g, '\r')
      .replace(/\\\\\\"/g, '\\"')
      .replace(/\\\\\"/g, '\\"')
      .replace(/\\\\"/g, '\\"')
      .replace(/\\"/g, '"')
      .replace(/\\\\'/g, "\\'")
      .replace(/\\'/g, "'")
      .replace(/\\\\\\/g, '\\')
      .replace(/\\\\/g, '\\');
    if (s === prev) break;
  }
  return s;
}

// --- SSE PARSING FUNCTION ---
function parseStreamData(responseText: string): StreamEvent[] {
  const events: StreamEvent[] = [];
  const lines = responseText.split('\n');

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const jsonString = line.substring(6).trim();
      if (jsonString) { // Ensure we don't process empty 'data:' lines
        try {
          const parsedEvent = JSON.parse(jsonString);
          events.push(parsedEvent);
        } catch (error) {
          // In a real app, you might want more robust error handling
          console.error('Failed to parse stream event JSON:', jsonString, error);
        }
      }
    }
  }
  return events;
}

// --- SLIDE EXTRACTION FUNCTION ---
function extractSlidesFromEvents(events: StreamEvent[]): ExtractedSlide[] {
  const tempSlides: { [key: number]: string } = {};
  const extractedSlides: ExtractedSlide[] = [];

  for (const event of events) {
    if (event.choices && event.choices.length > 0) {
      const choice = event.choices[0];
      // Handle both "messages" (SSE/Agent) and "message" (Standard JSON)
      // Also handle potential "delta" field for streaming responses if messages/message missing
      const messageRaw = choice.messages ? choice.messages[0] : (choice.message || (choice as any).delta);

      if (messageRaw) {
        const message = messageRaw as Message;

        // Check for our custom "phase" based tool calls
        // We relax the check: if it has content array with tool object, we parse it
        if (Array.isArray(message.content)) {
          const contentItems = message.content as ContentObject[];
          for (const item of contentItems) {
            if (item.type === 'object' && item.object) {
              const toolObject = item.object;
              if (toolObject.tool_name === 'add_slide' && toolObject.output && toolObject.position) {
                const slideIndex = toolObject.position[0] - 1;
                let unescapedOutput = deepUnescape(String(toolObject.output));
                tempSlides[slideIndex] = (tempSlides[slideIndex] || '') + unescapedOutput;
                logger.info(`Added HTML chunk to slide ${slideIndex + 1}: ${String(unescapedOutput).length} chars`);
              }
            }
          }
        }

        // Also support standard OpenAI "tool_calls" if Z.ai switches to that
        if ((message as any).tool_calls) {
          // ... implementation for standard tool_calls if needed, 
          // but sticking to the known custom schema first.
        }

        if (choice.finish_reason === 'stop') {
          logger.info('Generation complete - stopping processing');
          break;
        }
      }
    }
  }

  // Convert tempSlides to array of ExtractedSlide
  for (const [slideIndex, htmlContent] of Object.entries(tempSlides)) {
    const position = parseInt(slideIndex) + 1; // Convert back to 1-indexed

    // Extract title from HTML if possible
    const titleMatch = htmlContent.match(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/i);
    const slideTitle = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, '').trim() : `Slide ${position}`;

    if (htmlContent.length > 50) { // Only include slides with substantial content
      extractedSlides.push({
        position,
        title: slideTitle,
        html: htmlContent
      });

      logger.info(`Created slide ${position}: "${slideTitle}" (${htmlContent.length} chars)`);
    }
  }

  return extractedSlides;
}

export const fetchPresentationResponse = onDocumentCreated(
  {
    document: 'presentations/{presentationId}',
    region: 'australia-southeast1',
    secrets: ['ZAI_API_KEY'],
    timeoutSeconds: 540, // Max 9 mins
  },
  async (event) => {
    const startTime = Date.now();
    const presentationId = event.params.presentationId;

    logger.info('[DEBUG] fetchPresentationResponse triggered');

    // Create overall function timeout promise
    const functionTimeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Function timed out after ${FUNCTION_TIMEOUT / 1000} seconds for presentation ${presentationId}`));
      }, FUNCTION_TIMEOUT);
    });

    // Create the main processing promise
    const processingPromise = async () => {
      const snapshot = event.data;
      if (!snapshot) {
        logger.error('[DEBUG] No snapshot provided');
        return;
      }

      const presentation = snapshot.data();

      logger.info('[DEBUG] Presentation data:', presentation);
      logger.info('[DEBUG] Presentation ID:', presentationId);

      // Only process presentations with 'generating' status
      if (presentation?.status !== 'generating') {
        logger.info(`[DEBUG] Skipping presentation ${presentationId} - status is not 'generating': ${presentation?.status}`);
        return;
      }

      // IGNORE V2 presentations (handled by processPresentationV2)
      if (presentation?.version === 'v2') {
        logger.info(`[DEBUG] Skipping presentation ${presentationId} - version is 'v2' (handled by V2 pipeline)`);
        return;
      }

      const { title, slideCount, theme, userId } = presentation;

      logger.info(`Starting API fetch for presentation ${presentationId} for user ${userId}`);

      // Update status to indicate API fetching has started
      await snapshot.ref.update({
        status: 'fetching',
        fetchStartedAt: new Date()
      });

      // Fetch Z.AI API key from Secret Manager
      let apiKey: string;
      try {
        logger.info('[DEBUG] Attempting to fetch ZAI_API_KEY from Secret Manager');
        const name = `projects/scholars-alley-dev/secrets/ZAI_API_KEY/versions/latest`;
        logger.info(`[DEBUG] Secret name: ${name}`);

        const [version] = await secretManager.accessSecretVersion({ name });
        logger.info('[DEBUG] Secret version retrieved successfully');

        apiKey = version.payload?.data?.toString() || '';
        logger.info(`[DEBUG] API key length: ${apiKey.length}, is empty: ${!apiKey}`);

        if (!apiKey) {
          throw new Error('Empty secret - API key is null or empty');
        }

        logger.info('[DEBUG] Z.AI API key fetched successfully');
      } catch (e: any) {
        logger.error('[DEBUG] Failed to fetch Z.AI API key', {
          error: e.message,
          stack: e.stack,
          code: e.code,
          details: e.details,
          name: e.name
        });

        try {
          await snapshot.ref.update({
            status: 'fetch_failed',
            error: `API key configuration error: ${e.message}`,
            completedAt: new Date()
          });
          logger.info('[DEBUG] Updated presentation with fetch_failed status');
        } catch (updateError: any) {
          logger.error('[DEBUG] Failed to update presentation with error', updateError);
        }
        return;
      }

      // Call Z.ai Agent Run API
      try {
        logger.info('[DEBUG] Starting Z.ai Agent API call');

        // 1. Correct URL and Request Body
        const zaiApiUrl = `https://api.z.ai/api/v1/agents`;
        const requestBody = {
          agent_id: ZAI_AGENT_ID,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `Create a ${slideCount}-slide presentation about "${title}" with a "${theme || 'modern'}" theme.

CRITICAL FORMATTING INSTRUCTIONS:
1. Use the 'add_slide' tool to return each slide.
2. Each slide content MUST be a complete HTML5 document beginning with <!DOCTYPE html>.
3. Include a <style> block in the <head> of every slide.
4. The content MUST be wrapped in a main container: <div class="slide">.
5. The .slide class MUST have these EXACT styles: width: 1280px; height: 720px; overflow: hidden; position: relative; background: #ffffff;
6. DESIGN REQUIREMENTS:
   - Use Google Fonts (e.g., Roboto, Open Sans, Lato).
   - Use modern layouts (split screens, cards, grids), NOT just centered text.
   - Use styling (colors, gradients, shadows) that matches the "${theme || 'modern'}" theme.
   - Ensure text is legible and professionally typeset.
   - This HTML will be rendered in a 1280x720 viewer. Make it look like a finished Keynote or PowerPoint slide.`
                }
              ]
            }
          ],
          stream: true // Enable SSE streaming
        };
        logger.info('[DEBUG] Request URL:', zaiApiUrl);
        logger.info('[DEBUG] Request body:', requestBody);

        // 2. Make the API call with the CORRECT authentication header and timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          logger.warn(`[DEBUG] API call timeout - aborting request after ${API_TIMEOUT / 1000} seconds`);
          controller.abort();
        }, API_TIMEOUT);

        const response = await fetch(zaiApiUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`, // CRITICAL: Use 'Authorization: Bearer', not 'x-api-key'
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        // Clear timeout if request completed
        clearTimeout(timeoutId);

        logger.info(`[DEBUG] Z.ai API response status: ${response.status}`);
        logger.info(`[DEBUG] Z.ai API response headers:`, Object.fromEntries(response.headers.entries()));

        if (!response.ok) {
          const txt = await response.text();
          logger.error('[DEBUG] Z.ai API error', {
            status: response.status,
            statusText: response.statusText,
            text: txt,
            headers: Object.fromEntries(response.headers.entries())
          });

          try {
            await snapshot.ref.update({
              status: 'fetch_failed',
              error: `API error: ${response.status} - ${response.statusText}`,
              completedAt: new Date()
            });
            logger.info('[DEBUG] Updated presentation with fetch_failed status');
          } catch (updateError: any) {
            logger.error('[DEBUG] Failed to update presentation with API error', updateError);
          }
          return;
        }

        logger.info('[DEBUG] Z.ai API call successful, processing response');

        // Handle streaming response from Z.ai API
        const responseText = await response.text();
        logger.info('[DEBUG] Raw Z.ai response text length:', responseText.length);
        logger.info('[DEBUG] First 500 chars of response:', responseText.substring(0, 500));

        // Save the complete raw response to Cloud Storage for debugging
        const bucket = storage.bucket();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `presentation-responses/${presentationId}-${timestamp}.json`;
        const file = bucket.file(filename);

        const debugData = {
          presentationId,
          title,
          slideCount,
          theme,
          userId,
          timestamp: new Date().toISOString(),
          responseText,
          headers: Object.fromEntries(response.headers.entries()),
          status: response.status,
          statusText: response.statusText
        };

        await file.save(JSON.stringify(debugData, null, 2), {
          metadata: {
            contentType: 'application/json',
            presentationId,
            userId
          }
        });

        // Make the file publicly accessible for debugging (optional)
        await file.makePublic();
        const bucketUrl = `https://storage.googleapis.com/${bucket.name}/${filename}`;

        logger.info(`[DEBUG] Saved raw response to Cloud Storage: ${bucketUrl}`);

        // NEW: Use the proper SSE parsing approach from the working example
        logger.info('[DEBUG] Starting SSE parsing using the working example approach');

        let events = parseStreamData(responseText);
        logger.info(`[DEBUG] Parsed ${events.length} SSE events`);

        // NEW: Check for Z.ai specific error events (e.g. Insufficient Balance)
        const errorEvent = events.find(e => e.status === 'failed');
        if (errorEvent && errorEvent.error) {
          const errMsg = `Z.ai API Error ${errorEvent.error.code}: ${errorEvent.error.message}`;
          logger.error(`[DEBUG] Detected API error in stream: ${errMsg}`);

          await snapshot.ref.update({
            status: 'fetch_failed',
            error: errMsg,
            completedAt: new Date()
          });
          return;
        }

        // FALLBACK: If SSE parsing found nothing, try parsing as a standard JSON response
        if (events.length === 0) {
          try {
            logger.info('[DEBUG] No SSE events found. Attempting to parse as standard JSON.');
            const jsonResponse = JSON.parse(responseText);
            if (jsonResponse.choices && Array.isArray(jsonResponse.choices)) {
              events = [jsonResponse]; // Treat the single response as one event
              logger.info('[DEBUG] Successfully parsed as standard JSON completion.');
            }
          } catch (e) {
            logger.warn('[DEBUG] Failed to parse as standard JSON:', e);
          }
        }

        const extractedSlides = extractSlidesFromEvents(events);
        logger.info(`[DEBUG] Extracted ${extractedSlides.length} slides from events`);

        // Log extracted slides details
        extractedSlides.forEach((slide, index) => {
          logger.info(`[DEBUG] Slide ${index + 1}: Position ${slide.position}, Title: "${slide.title}", HTML length: ${slide.html.length}`);
        });

        // Create structured content from extracted slides
        let rawContent: string;

        if (extractedSlides.length > 0) {
          // Sort slides by position
          extractedSlides.sort((a, b) => a.position - b.position);

          // Create structured content with slide data
          const structuredSlides = extractedSlides.map(slide => ({
            slideNumber: slide.position,
            title: slide.title,
            content: slide.html, // Store HTML content directly
            html: slide.html // Also store as html field for clarity
          }));

          // Store both the structured data and a readable version
          rawContent = JSON.stringify({
            slides: structuredSlides,
            extractionMethod: 'sse_parsing',
            totalSlides: extractedSlides.length,
            eventsProcessed: events.length
          });

          logger.info(`[DEBUG] Created structured content from ${extractedSlides.length} extracted slides`);
        } else {
          // Fallback if no slides were extracted
          logger.warn('[DEBUG] No slides extracted from SSE events, creating fallback content');
          rawContent = JSON.stringify({
            slides: [{
              slideNumber: 1,
              title: title || 'Presentation',
              content: `<div><h1>${title || 'Presentation'}</h1><p>No content could be extracted from the AI response. Please try again.</p></div>`,
              html: `<div><h1>${title || 'Presentation'}</h1><p>No content could be extracted from the AI response. Please try again.</p></div>`
            }],
            extractionMethod: 'fallback',
            totalSlides: 1,
            eventsProcessed: events.length
          });
        }

        logger.info('[DEBUG] Final structured content:', rawContent);

        // Update the presentation document with the fetched content and bucket URL
        await snapshot.ref.update({
          status: 'fetched',
          rawContent: rawContent,
          bucketUrl: bucketUrl,
          fetchCompletedAt: new Date(),
          extractedSlidesCount: extractedSlides.length,
          eventsProcessed: events.length
        });

        logger.info(`[${presentationId}] Successfully fetched and stored presentation content. Bucket URL: ${bucketUrl}`);

      } catch (e: any) {
        logger.error('Error during presentation fetch', e);

        // Handle specific timeout errors
        let errorMessage = e.message || 'Unknown error';
        if (e.name === 'AbortError' || e.message.includes('aborted')) {
          errorMessage = `Presentation generation timed out after ${API_TIMEOUT / 1000} seconds. The AI service took too long to respond. Please try again with a simpler topic or fewer slides.`;
          logger.warn(`[TIMEOUT] Presentation ${presentationId} timed out after ${API_TIMEOUT / 1000} seconds`);
        } else if (e.message.includes('timeout')) {
          errorMessage = `Request timeout: ${e.message}`;
        }

        await snapshot.ref.update({
          status: 'fetch_failed',
          error: errorMessage,
          completedAt: new Date()
        });
      }
    };

    // Race the processing against the timeout
    try {
      await Promise.race([
        processingPromise(),
        functionTimeoutPromise
      ]);

      const processingTime = Date.now() - startTime;
      logger.info(`[DEBUG] Processing completed successfully in ${processingTime}ms for presentation ${presentationId}`);

    } catch (error: any) {
      const processingTime = Date.now() - startTime;

      // Check if this is a timeout error
      if (error.message && error.message.includes('timed out')) {
        logger.error(`[TIMEOUT] Presentation processing timed out after ${processingTime}ms for presentation ${presentationId}`);
        logger.error(`[TIMEOUT] Error details:`, error.message);

        // Update database with timeout error
        try {
          const snapshot = event.data;
          if (snapshot && snapshot.ref) {
            await snapshot.ref.update({
              status: 'fetch_failed',
              error: `Processing timed out after ${Math.round(processingTime / 1000)}s. ${error.message}`,
              completedAt: new Date(),
              processingTime: processingTime
            });

            logger.info(`[TIMEOUT] Updated presentation ${presentationId} with timeout error in database`);
          }
        } catch (dbError: any) {
          logger.error(`[TIMEOUT] Failed to update database with timeout error:`, dbError.message);
        }
      } else {
        // Handle other errors
        logger.error(`[ERROR] Processing failed after ${processingTime}ms for presentation ${presentationId}:`, error);

        try {
          const snapshot = event.data;
          if (snapshot && snapshot.ref) {
            await snapshot.ref.update({
              status: 'fetch_failed',
              error: error.message || 'Unknown processing error',
              completedAt: new Date(),
              processingTime: processingTime
            });
          }
        } catch (dbError: any) {
          logger.error(`[ERROR] Failed to update database with error:`, dbError.message);
        }
      }

      // Re-throw the error so Firebase Functions knows it failed
      throw error;
    }
  }
);
