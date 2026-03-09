import { logger } from 'firebase-functions/v2';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';

const db = getFirestore();

// --- CONFIGURATION ---
// Timeout configurations (in milliseconds)
const FUNCTION_TIMEOUT = 20 * 60 * 1000; // 20 minutes total (Firebase Functions Gen 2 maximum)

interface Slide {
  slideNumber: number;
  title: string;
  content: string;
  html?: string; // New: HTML content from tool calls
  detailedNotes?: string;
  narrationScript?: string;
  audioUrl?: string;
}

// --- HELPER FUNCTIONS ---

// Extract final concatenated text content from a raw SSE stream response
function extractFinalContentFromSse(responseText: string): string {
  logger.info('[DEBUG] Attempting to extract content from SSE stream');
  const lines = responseText.split('\n');
  let concatenatedText = '';

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      try {
        const jsonString = line.substring(6);
        const sseChunk = JSON.parse(jsonString);

        if (sseChunk.choices && Array.isArray(sseChunk.choices)) {
          for (const choice of sseChunk.choices) {
            if (choice.messages && Array.isArray(choice.messages)) {
              for (const message of choice.messages) {
                // Concatenate text from assistant messages
                if (message.role === 'assistant' &&
                  message.content?.type === 'text' &&
                  message.content?.text) {
                  concatenatedText += message.content.text;
                }
              }
            }
          }
        }
      } catch (e) {
        // Ignore lines that look like SSE data but aren't valid JSON, or are control messages
        logger.warn('[DEBUG] Failed to parse SSE data line:', e instanceof Error ? e.message : String(e));
      }
    }
  }

  logger.info(`[DEBUG] Extracted ${concatenatedText.length} characters from SSE stream.`);
  return concatenatedText.trim();
}

// Extract any presentation content from the raw response text (Heuristic fallback)
function extractAnyPresentationContent(responseText: string): string {
  logger.info('[DEBUG] Attempting to extract presentation content from raw response using heuristic fallback');

  // As a last resort, look for any substantial text content by removing SSE markers
  const textContent = responseText.replace(/data: \{[^}]*\}/g, '').replace(/[{}[\]",]/g, ' ').trim();
  if (textContent.length > 200) {
    logger.info(`[DEBUG] Using cleaned text content as fallback: ${textContent.length} characters`);
    return textContent;
  }

  return '';
}

// Create a basic presentation as a fallback
function createBasicPresentation(title: string, slideCount: number): string {
  logger.info(`[DEBUG] Creating basic presentation for "${title}" with ${slideCount} slides`);

  let content = `# ${title}\n\n`;

  for (let i = 1; i <= Math.min(slideCount, 5); i++) {
    content += `---\n\n## Slide ${i}\n\n`;

    switch (i) {
      case 1:
        content += `### Introduction\n\nThis presentation covers the topic of ${title}.\n\nKey points will be discussed in the following slides.`;
        break;
      case 2:
        content += `### Overview\n\n- What is ${title}?\n- Why is it important?\n- Key concepts and terminology`;
        break;
      case 3:
        content += `### Main Points\n\n- First important aspect\n- Second important aspect\n- Third important aspect`;
        break;
      case 4:
        content += `### Examples\n\nHere are some practical examples:\n\n1. Example 1\n2. Example 2\n3. Example 3`;
        break;
      case 5:
        content += `### Conclusion\n\n- Summary of key points\n- Takeaways\n- Questions and discussion`;
        break;
      default:
        content += `### Additional Information\n\nMore details about ${title}.`;
        break;
    }

    content += '\n';
  }

  return content;
}

// This function will parse the Markdown-like string from Z.ai into a structured array.
function parseZaiResponse(content: string): { title: string, content: string }[] {
  const slides = [];

  // Try different slide delimiters
  let slideSections = content.split(/\n---\n/).filter(s => s.trim() !== '');

  // If no --- delimiters, try splitting by ## headers
  if (slideSections.length <= 1) {
    slideSections = content.split(/\n## /).filter(s => s.trim() !== '');
  }

  // If still only one section, try splitting by # headers
  if (slideSections.length <= 1) {
    slideSections = content.split(/\n# /).filter(s => s.trim() !== '');
  }

  for (const section of slideSections) {
    const lines = section.trim().split('\n');
    let title = '';
    let slideContent = '';

    // Extract title (first header line)
    if (lines.length > 0) {
      const titleLine = lines[0].replace(/^#+\s*/, '').trim();
      if (titleLine) {
        title = titleLine;
        slideContent = lines.slice(1).join('\n').trim();
      } else if (lines.length > 1) {
        // If first line is empty, try second line as title
        title = lines[1].replace(/^#+\s*/, '').trim();
        slideContent = lines.slice(2).join('\n').trim();
      }
    }

    // If no title found, create a default one
    if (!title) {
      title = `Slide ${slides.length + 1}`;
      slideContent = section.trim();
    }

    if (title || slideContent) {
      slides.push({ title, content: slideContent });
    }
  }

  // If no slides were parsed, create one with all content
  if (slides.length === 0 && content.trim()) {
    slides.push({
      title: 'Presentation',
      content: content.trim()
    });
  }

  return slides;
}

// --- Normalization helpers ---
// Ensures each slide has a scaffolded `html` field and an optional `safeHtml` (sanitized) field.
// Attempts to use server-side DOMPurify (isomorphic-dompurify + jsdom) if available, otherwise falls back to the scaffolded HTML.
function scaffoldHtml(fragment: string, baseHref?: string) {
  const headExtras: string[] = [];
  if (baseHref) headExtras.push(`<base href="${baseHref}">`);

  const defaultStyles = `
    <style>
      html, body { width: 100%; height: 100%; margin: 0; padding: 0; overflow: hidden; background-color: #202020; }
      body { display: flex; justify-content: center; align-items: center; }
      .slide {
        background-color: white;
        transform-origin: center center;
        display: flex;
        flex-direction: column;
        padding: 60px 80px;
        box-sizing: border-box;
        box-shadow: 0 0 50px rgba(0,0,0,0.5);
        font-family: 'Segoe UI', sans-serif;
      }
      .slide h1 { font-size: 3.5rem; font-weight: 800; margin-bottom: 0.5em; color: #111827; line-height: 1.1; letter-spacing: -0.02em; }
      .slide h2 { font-size: 2.25rem; font-weight: 600; margin-bottom: 0.5em; color: #374151; letter-spacing: -0.01em; }
      .slide p, .slide li { font-size: 1.6rem; line-height: 1.6; color: #374151; margin-bottom: 0.8em; }
      .slide img { max-width: 100%; max-height: 400px; object-fit: contain; margin: 2rem auto; display: block; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
      .slide ul, .slide ol { padding-left: 1.5em; }
      .slide li { margin-bottom: 0.4em; }
      .slide strong { color: #111827; font-weight: 700; }
      .slide blockquote { border-left: 6px solid #6366f1; padding-left: 1.5em; font-style: italic; color: #4f46e5; background: #f5f3ff; padding: 1.5em; border-radius: 0 8px 8px 0; }
    </style>
  `;

  const head = `<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>${headExtras.join('')}${defaultStyles}</head>`;
  const body = `<body>${fragment || ''}</body>`;
  return `<!doctype html><html>${head}${body}</html>`;
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

function normalizeSlidePayload(rawSlide: any, defaultBaseHref?: string) {
  // Pick likely fragment sources
  let fragment = rawSlide?.html || rawSlide?.content || (rawSlide?.toolCalls && rawSlide.toolCalls[0]?.content) || '';
  const baseHref = rawSlide?.baseHref || defaultBaseHref || undefined;

  // Defense: if fragment is a JSON-encoded string (e.g. "\"<div>...</div>\"") try to unquote it
  try {
    const trimmed = (fragment || '').trim();
    if (/^["'].*["']$/.test(trimmed)) {
      // attempt JSON.parse to safely unquote a JSON string
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        fragment = JSON.parse(trimmed);
      } catch {
        // ignore parse error and keep original
        fragment = trimmed.replace(/^["']|["']$/g, '');
      }
    }
  } catch (e) {
    // ignore
  }

  // Replace common escaped sequences that indicate double-encoding: \n, \r, \t, escaped quotes
  try {
    if (typeof fragment === 'string') {
      fragment = fragment.replace(/\\r\\n/g, '\r\n')
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\"/g, '"')
        .replace(/\\'/g, "'")
        .replace(/\\\\/g, '\\');
      // Trim stray wrapping quotes again
      fragment = String(fragment).trim().replace(/^["']|["']$/g, '');
    }
  } catch (e) {
    // ignore transformation errors
  }

  // If the fragment already contains a full HTML document, keep it; otherwise scaffold it.
  let scaffolded = fragment && /^\s*<!doctype html>/i.test(fragment) ? fragment : scaffoldHtml(fragment, baseHref);

  // --- WRAPPER FIX START ---
  // Ensure the content is wrapped in a .slide div for the scaler script to work
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM(scaffolded);
    const doc = dom.window.document;

    const slideDiv = doc.querySelector('.slide');
    if (!slideDiv) {
      logger.info('[DEBUG] No .slide wrapper found. Wrapping content in .slide div.');
      const body = doc.body;
      if (body) {
        const wrapper = doc.createElement('div');
        wrapper.className = 'slide';
        // Move all children into the wrapper
        while (body.firstChild) {
          wrapper.appendChild(body.firstChild);
        }
        body.appendChild(wrapper);
        scaffolded = dom.serialize();
      }
    }
  } catch (err) {
    logger.warn('[DEBUG] Failed to enforce .slide wrapper:', err);
    // Fallback: proceed with original scaffolded content
  }
  // --- WRAPPER FIX END ---

  // Inject responsive scaling CSS (matching the example app) so slides scale to iframe width without scrollbars.
  // Allow <style> tags and ensure whole document structure is preserved
  let safeHtml: string = scaffolded;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const createDOMPurify = require('isomorphic-dompurify');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { JSDOM } = require('jsdom');
    const window = (new JSDOM('')).window as any;
    const DOMPurify = createDOMPurify(window);

    // Allow <style> tags and ensure whole document structure is preserved
    safeHtml = DOMPurify.sanitize(scaffolded, {
      WHOLE_DOCUMENT: true,
      ADD_TAGS: ['style'],
      ADD_ATTR: ['style', 'class', 'id', 'width', 'height', 'transform', 'viewBox', 'preserveAspectRatio', 'd', 'fill', 'stroke', 'stroke-width']
    });

    // Inject scaling script (matching archive/slide-parser2/components/SlideViewer.tsx logic)
    // We do this AFTER sanitization to ensure the script is not stripped (assuming we trust our own injection)
    // Note: DOMPurify above doesn't allow script, so user content scripts are stripped. We append ours now.
    const scalingScript = `<script>
      function resizeSlide() {
        var slide = document.querySelector('.slide');
        if (slide) {
          // Enforce required dimensions for scaling math to work
          slide.style.width = '1280px';
          slide.style.height = '720px';
          slide.style.overflow = 'hidden';
          
          var targetW = 1280;
          var targetH = 720;
          var winW = window.innerWidth;
          var winH = window.innerHeight;
          var scale = Math.min(winW / targetW, winH / targetH);
          
          slide.style.transformOrigin = 'center center';
          slide.style.transform = 'translate(-50%, -50%) scale(' + scale + ')';
          slide.style.position = 'absolute';
          slide.style.top = '50%';
          slide.style.left = '50%';
        }
        document.body.style.backgroundColor = '#0f172a';
        document.body.style.margin = '0';
        document.body.style.overflow = 'hidden';
      }
      window.addEventListener('resize', resizeSlide);
      window.addEventListener('load', resizeSlide);
      // Fire immediately in case load already fired
      resizeSlide();
      // Fire again after a short delay to handle dynamic content/fonts loading
      setTimeout(resizeSlide, 100); 
    </script>`;

    if (safeHtml.includes('</body>')) {
      safeHtml = safeHtml.replace('</body>', scalingScript + '</body>');
    } else {
      safeHtml += scalingScript;
    }
  } catch (e) {
    logger.warn('[DEBUG] Server-side DOMPurify unavailable or failed; using scaffolded HTML as safeHtml fallback');
    safeHtml = scaffolded;
  }

  return {
    html: scaffolded,
    safeHtml,
    baseHref,
  };
}

export const processPresentation = onDocumentUpdated(
  {
    document: 'presentations/{presentationId}',
    region: 'australia-southeast1',
    timeoutSeconds: 540, // Max 9 mins for Gen 1
  },
  async (event) => {
    const startTime = Date.now();
    const presentationId = event.params.presentationId;

    logger.info('[DEBUG] processPresentation triggered');

    // Create a timeout promise that will reject after 15 minutes
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Presentation processing timed out after 15 minutes for presentation ${presentationId}`));
      }, 15 * 60 * 1000); // 15 minutes
    });

    // Create the main processing promise
    const processingPromise = async () => {
      const snapshot = event.data;
      if (!snapshot) {
        logger.error('[DEBUG] No snapshot provided');
        return;
      }

      const beforeData = event.data?.before?.data();
      const afterData = event.data?.after?.data();

      logger.info('[DEBUG] Before data:', beforeData);
      logger.info('[DEBUG] After data:', afterData);
      logger.info('[DEBUG] Presentation ID:', presentationId);

      // Only process presentations that just changed to 'fetched' status
      if (beforeData?.status !== 'fetched' && afterData?.status !== 'fetched') {
        logger.info(`[DEBUG] Skipping presentation ${presentationId} - status change not from/to 'fetched': ${beforeData?.status} → ${afterData?.status}`);
        return;
      }

      // Only process when status changed TO 'fetched'
      if (afterData?.status !== 'fetched') {
        logger.info(`[DEBUG] Skipping presentation ${presentationId} - new status is not 'fetched': ${afterData?.status}`);
        return;
      }

      const { title, slideCount, theme, userId, rawContent, bucketUrl } = afterData;

      logger.info(`Starting presentation processing for ${presentationId} for user ${userId}`);
      logger.info(`[DEBUG] Raw content length: ${rawContent?.length || 0}`);
      logger.info(`[DEBUG] Bucket URL: ${bucketUrl}`);

      // Use the raw content that was already fetched and processed
      let contentToProcess = rawContent;

      if (!contentToProcess) {
        logger.error('[DEBUG] No raw content found in presentation document');
        try {
          await snapshot.after.ref.update({
            status: 'processing_failed',
            error: 'No raw content found to process',
            completedAt: new Date()
          });
        } catch (updateError: any) {
          logger.error('[DEBUG] Failed to update presentation with error', updateError instanceof Error ? updateError.message : String(updateError));
        }
        return;
      }

      // Update status to indicate processing has started
      await snapshot.after.ref.update({
        status: 'processing',
        processingStartedAt: new Date()
      });

      try {
        logger.info('[DEBUG] Starting to process fetched content');

        let formattedSlides: Slide[] = [];

        // NEW: Check if content is structured JSON from SSE parsing
        if (contentToProcess.includes('extractionMethod') && contentToProcess.includes('sse_parsing')) {
          logger.info('[DEBUG] Processing structured content from SSE parsing');

          try {
            const structuredData = JSON.parse(contentToProcess);

            if (structuredData.slides && Array.isArray(structuredData.slides)) {
              logger.info(`[DEBUG] Found ${structuredData.slides.length} structured slides from SSE parsing`);

              // The slides are already properly structured from the SSE parsing
              formattedSlides = structuredData.slides.map((slide: any) => {
                // Normalize each slide payload to ensure html + safeHtml + baseHref exist
                const norm = normalizeSlidePayload({
                  html: slide.html,
                  content: slide.content,
                  toolCalls: slide.toolCalls,
                  baseHref: slide.baseHref
                }, bucketUrl);

                return {
                  slideNumber: slide.slideNumber,
                  title: slide.title || `Slide ${slide.slideNumber}`,
                  content: slide.content || '',
                  html: norm.html,
                  safeHtml: norm.safeHtml,
                  baseHref: norm.baseHref || null
                };
              });

              logger.info(`[DEBUG] Processed ${formattedSlides.length} slides from SSE parsing`);
            }
          } catch (parseError: any) {
            logger.warn('[DEBUG] Failed to parse SSE structured content, falling back to text parsing:', parseError.message);
          }
        }

        // Fallback: If no structured content found, use existing text parsing
        if (formattedSlides.length === 0) {
          logger.info('[DEBUG] No structured content found, using fallback text parsing');

          // Check if content looks like an SSE stream and parse it generically if so
          if (contentToProcess.includes('data: {') && contentToProcess.includes('"phase":')) {
            logger.info('[DEBUG] Raw content detected as SSE stream. Using dedicated parser.');
            contentToProcess = extractFinalContentFromSse(contentToProcess);
          } else {
            // Fallback to existing heuristic if it doesn't look like SSE
            contentToProcess = extractAnyPresentationContent(contentToProcess);
          }

          if (!contentToProcess || contentToProcess.trim().length === 0) {
            throw new Error("Content is empty or unparseable after extraction/cleaning.");
          }

          // Parse the raw content into structured slides
          const parsedSlides = parseZaiResponse(contentToProcess);
          logger.info(`[DEBUG] Parsed ${parsedSlides.length} slides from fetched content`);

          if (parsedSlides.length === 0) {
            throw new Error("No slides could be parsed from the fetched content.");
          }

          // Format and normalize slides, then save to Firestore
          formattedSlides = parsedSlides.map((slide, index) => {
            const norm = normalizeSlidePayload({ content: slide.content }, bucketUrl);
            return {
              slideNumber: index + 1,
              title: slide.title || `Slide ${index + 1}`,
              content: slide.content || '',
              html: norm.html,
              safeHtml: norm.safeHtml,
              baseHref: norm.baseHref || null
            };
          });
        }

        await snapshot.after.ref.update({
          slides: formattedSlides,
          status: 'completed',
          completedAt: new Date(),
        });

        logger.info(`[${presentationId}] Successfully processed and stored ${formattedSlides.length} slides.`);

        // NEW: If this presentation was triggered by a generationJob, mark that job as completed too
        const generationJobId = afterData.generationJobId;
        if (generationJobId) {
          try {
            await db.collection('generationJobs').doc(generationJobId).update({
              status: 'completed',
              presentationId: presentationId, // Ensure link is bidirectional
              completedAt: new Date(),
              updatedAt: new Date()
            });
            logger.info(`[${presentationId}] Updated parent generationJob ${generationJobId} to completed.`);
          } catch (jobUpdateErr: any) {
            logger.error(`[${presentationId}] Failed to update parent generationJob ${generationJobId}:`, jobUpdateErr);
            // Don't fail the presentation processing just because the job update failed
          }
        }

      } catch (e: any) {
        logger.error('Error during presentation processing', e);

        let errorMessage = e.message || 'Unknown error';

        await snapshot.after.ref.update({
          status: 'processing_failed',
          error: errorMessage,
          completedAt: new Date()
        });
      }
    };

    // Race the processing against the timeout
    try {
      await Promise.race([
        processingPromise(),
        timeoutPromise
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
          if (snapshot && snapshot.after) {
            await snapshot.after.ref.update({
              status: 'processing_failed',
              error: `Processing timed out after 15 minutes. Processing time: ${Math.round(processingTime / 1000)}s`,
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
          if (snapshot && snapshot.after) {
            await snapshot.after.ref.update({
              status: 'processing_failed',
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
