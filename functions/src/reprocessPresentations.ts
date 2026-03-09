import { onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';

const db = getFirestore();

/**
 * Helper: scaffoldHtml - same logic as processPresentation to ensure consistent scaffolding.
 */
function scaffoldHtml(fragment: string, baseHref?: string) {
  const headExtras: string[] = [];
  if (baseHref) headExtras.push(`<base href="${baseHref}">`);
  const head = `<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>${headExtras.join('')}</head>`;
  const body = `<body>${fragment || ''}</body>`;
  return `<!doctype html><html>${head}${body}</html>`;
}

/**
 * Helper: normalizeSlidePayload - duplicate of the normalization used by processPresentation.
 * This runs the same unescape/replace/scaffold flow to create html and safeHtml.
 * Note: server-side DOMPurify usage is attempted but optional (requires isomorphic-dompurify/jsdom installed).
 */
function normalizeSlidePayload(rawSlide: any, defaultBaseHref?: string) {
  let fragment = rawSlide?.html || rawSlide?.content || (rawSlide?.toolCalls && rawSlide.toolCalls[0]?.content) || '';
  const baseHref = rawSlide?.baseHref || defaultBaseHref || undefined;

  try {
    const trimmed = (fragment || '').trim();
    if (/^["'].*["']$/.test(trimmed)) {
      try {
        fragment = JSON.parse(trimmed);
      } catch {
        fragment = trimmed.replace(/^["']|["']$/g, '');
      }
    }
  } catch (e) {
    // ignore
  }

  try {
    if (typeof fragment === 'string') {
      fragment = fragment.replace(/\\r\\n/g, '\r\n')
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\"/g, '"')
        .replace(/\\'/g, "'")
        .replace(/\\\\/g, '\\');
      fragment = String(fragment).trim().replace(/^["']|["']$/g, '');
    }
  } catch (e) {
    // ignore
  }

  let scaffolded = fragment && /^\s*<!doctype html>/i.test(fragment) ? fragment : scaffoldHtml(fragment, baseHref);

  // --- WRAPPER FIX START ---
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM(scaffolded);
    const doc = dom.window.document;

    const slideDiv = doc.querySelector('.slide');
    if (!slideDiv) {
      const body = doc.body;
      if (body) {
        const wrapper = doc.createElement('div');
        wrapper.className = 'slide';
        while (body.firstChild) {
          wrapper.appendChild(body.firstChild);
        }
        body.appendChild(wrapper);
        scaffolded = dom.serialize();
      }
    }
  } catch (err) {
    // ignore
  }
  // --- WRAPPER FIX END ---

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

    // Inject scaling script (matching archive/slide-parser2 logic)
    const scalingScript = `<script>
      function resizeSlide() {
        var slide = document.querySelector('.slide');
        if (slide) {
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
      resizeSlide();
    </script>`;

    if (safeHtml.includes('</body>')) {
      safeHtml = safeHtml.replace('</body>', scalingScript + '</body>');
    } else {
      safeHtml += scalingScript;
    }
  } catch (e) {
    logger.warn('[reprocess] Server-side DOMPurify unavailable or failed; using scaffolded HTML as safeHtml fallback');
    safeHtml = scaffolded;
  }

  return {
    html: scaffolded,
    safeHtml,
    baseHref,
  };
}

/**
 * HTTP endpoint to reprocess presentations.
 * Accepts JSON body:
 *  - presentationId: string (optional) — if set, only reprocess that presentation
 *  - limit: number (optional) — number of presentations to reprocess (only used when presentationId not set)
 *
 * Example body:
 * { "presentationId": "abc123" }
 * or
 * { "limit": 10 }
 */
export const reprocessPresentations = onRequest(async (req: any, res: any) => {
  try {
    const { presentationId, limit } = req.body || {};
    if (presentationId) {
      // Reprocess a single presentation
      const docRef = db.collection('presentations').doc(presentationId);
      const snapshot = await docRef.get();
      if (!snapshot.exists) {
        res.status(404).send({ error: 'presentation not found' });
        return;
      }
      const data = snapshot.data();
      if (!data) {
        res.status(400).send({ error: 'presentation document empty' });
        return;
      }

      // If rawContent is present, reuse existing logic: if structured, re-normalize slides
      const rawContent = data.rawContent;
      const bucketUrl = data.bucketUrl;

      if (!rawContent) {
        res.status(400).send({ error: 'no rawContent to reprocess' });
        return;
      }

      let structured;
      try {
        structured = JSON.parse(rawContent);
      } catch {
        structured = null;
      }

      let formattedSlides: any[] = [];
      if (structured && Array.isArray(structured.slides)) {
        formattedSlides = structured.slides.map((s: any) => {
          const norm = normalizeSlidePayload({ html: s.html || s.content }, bucketUrl);
          return {
            slideNumber: s.slideNumber,
            title: s.title || '',
            content: s.content || '',
            html: norm.html,
            safeHtml: norm.safeHtml,
            baseHref: norm.baseHref || null
          };
        });
      } else {
        // Try to parse as text slides
        // We mimic processPresentation behavior minimally: parseZaiResponse-like splitting is simple here
        const text = (typeof rawContent === 'string') ? rawContent : JSON.stringify(rawContent);
        // Simple split by --- as a pragmatic fallback
        const parts = text.split(/\n---\n/).filter(p => p.trim());
        formattedSlides = parts.map((p: string, idx: number) => {
          const norm = normalizeSlidePayload({ content: p }, bucketUrl);
          return {
            slideNumber: idx + 1,
            title: `Slide ${idx + 1}`,
            content: p,
            html: norm.html,
            safeHtml: norm.safeHtml,
            baseHref: norm.baseHref || null
          };
        });
      }

      await docRef.update({
        slides: formattedSlides,
        status: 'completed',
        reprocessedAt: new Date()
      });

      res.status(200).send({ presentationId, slidesProcessed: formattedSlides.length });
      return;
    }

    // No presentationId: batch reprocess recent presentations with status 'completed' or older
    const q = db.collection('presentations')
      .where('status', 'in', ['completed', 'fetched'])
      .orderBy('completedAt', 'desc')
      .limit(limit ? Number(limit) : 20);

    const snapshot = await q.get();
    if (snapshot.empty) {
      res.status(200).send({ message: 'no presentations to reprocess' });
      return;
    }

    const results: any[] = [];
    for (const doc of snapshot.docs) {
      const data = doc.data();
      const rawContent = data.rawContent;
      const bucketUrl = data.bucketUrl;

      if (!rawContent) {
        results.push({ id: doc.id, skipped: true, reason: 'no rawContent' });
        continue;
      }

      let structured;
      try {
        structured = JSON.parse(rawContent);
      } catch {
        structured = null;
      }

      let formattedSlides: any[] = [];
      if (structured && Array.isArray(structured.slides)) {
        formattedSlides = structured.slides.map((s: any) => {
          const norm = normalizeSlidePayload({ html: s.html || s.content }, bucketUrl);
          return {
            slideNumber: s.slideNumber,
            title: s.title || '',
            content: s.content || '',
            html: norm.html,
            safeHtml: norm.safeHtml,
            baseHref: norm.baseHref || null
          };
        });
      } else {
        const text = (typeof rawContent === 'string') ? rawContent : JSON.stringify(rawContent);
        const parts = text.split(/\n---\n/).filter(p => p.trim());
        formattedSlides = parts.map((p: string, idx: number) => {
          const norm = normalizeSlidePayload({ content: p }, bucketUrl);
          return {
            slideNumber: idx + 1,
            title: `Slide ${idx + 1}`,
            content: p,
            html: norm.html,
            safeHtml: norm.safeHtml,
            baseHref: norm.baseHref || null
          };
        });
      }

      try {
        await doc.ref.update({
          slides: formattedSlides,
          reprocessedAt: new Date()
        });
        results.push({ id: doc.id, slidesProcessed: formattedSlides.length });
      } catch (e: any) {
        results.push({ id: doc.id, error: e.message });
      }
    }

    res.status(200).send({ results });
  } catch (err: any) {
    logger.error('[reprocess] Unexpected error', err);
    res.status(500).send({ error: err.message || 'unknown' });
  }
});
