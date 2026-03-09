"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScoutClient = void 0;
const admin = __importStar(require("firebase-admin"));
const firebase_functions_1 = require("firebase-functions");
const sharp_1 = __importDefault(require("sharp"));
const node_fetch_1 = __importDefault(require("node-fetch"));
const safety_1 = require("../lib/safety");
const model_config_1 = require("../config/model-config");
const schemas_1 = require("./schemas");
const jsonrepair_1 = require("jsonrepair");
class ScoutClient {
    constructor() { }
    /**
     * Stage 1: The Scout
     * Analyzes layout, identifies regions, and detects PII.
     * Uses Gemini 2.0 Flash.
     */
    async detectLayoutAndPII(imageUrl, userHint) {
        firebase_functions_1.logger.info(`[Scout] analyzing ${imageUrl} with hint: ${userHint || 'none'}`);
        const prompt = `You are an expert Document Analyst. 
        Analyze the provided image layout.
        
        Task:
        1. Identify the Artifact Type (worksheet, passage, notes, etc).
        2. Infer the Subject and Year Level.
        3. Identify ALL distinct regions (Questions, Passages, Diagrams).
        4. DETECT PII: Look for student names, handwritten signatures, teacher names, or school stamps.
           - If found, set "pii_detected": true and provide "pii_bbox" [ymin, xmin, ymax, xmax] (0-1000 scale).
        5. Identify "Context Regions" (e.g. a reading passage that applies to multiple questions).
        6. Check for "Cross-Page" questions (e.g. "Question 3 continued..."). Set "continues_on_next": true.

        ${userHint ? `USER HINT: The user says "${userHint}". Focus on this context.` : ""}
        
        Return JSON matching the schema.`;
        try {
            const llmResult = await (0, safety_1.callWithSafetyFallback)(model_config_1.ModelType.ArtifactScout, model_config_1.ModelType.Vision, // Fallback to standard Vision (Claude/GPT-4o)
            [
                { role: 'system', content: prompt },
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: "Scan this document." },
                        { type: 'image_url', image_url: { url: imageUrl } }
                    ]
                }
            ], {
                response_format: {
                    type: 'json_schema',
                    json_schema: {
                        name: 'scout_result',
                        strict: true,
                        schema: schemas_1.ScoutJSONSchema
                    }
                }
            });
            if (!llmResult) {
                firebase_functions_1.logger.warn('[Scout] Layout analysis blocked by safety filters (Double Refusal).');
                throw new Error('SAFETY_BLOCK: Document content triggered safety filters.');
            }
            // Parse result
            const content = llmResult.choices[0].message.content;
            const parsed = JSON.parse((0, jsonrepair_1.jsonrepair)(content));
            // Check for PII and blur if necessary
            const piiRegions = parsed.regions.filter(r => r.pii_detected && r.pii_bbox);
            let safeUrl = imageUrl;
            if (piiRegions.length > 0) {
                firebase_functions_1.logger.info(`[Scout] PII Detected in ${piiRegions.length} regions. Blurring...`);
                safeUrl = await this.blurPII(imageUrl, piiRegions.map(r => r.pii_bbox));
            }
            return { result: parsed, safeImageUrl: safeUrl };
        }
        catch (error) {
            firebase_functions_1.logger.error('[Scout] Analysis failed', error);
            throw error;
        }
    }
    /**
     * Downloads image, blurs regions, uploads back (overwriting or creating processed version), returns new URL.
     */
    async blurPII(imageUrl, bboxes) {
        try {
            // 1. Download
            const resp = await (0, node_fetch_1.default)(imageUrl);
            const buffer = Buffer.from(await resp.arrayBuffer());
            // 2. Load with Sharp
            const image = (0, sharp_1.default)(buffer);
            const metadata = await image.metadata();
            const w = metadata.width || 1000;
            const h = metadata.height || 1000;
            // 3. Create composite overlay (blurred patches)
            // Strategy: Extract the region, blur it heavily, then composite it back.
            // Or simpler: Draw a black/white rectangle? The requirement says "pixelate/blur".
            // Implementation: Composite logical operations or extract-blur-composite loop.
            // Efficient approach: SVG overlay for redaction (black bars) is safest and fastest.
            // "Pixelate" is harder to guarantee irreversible. Black box is safer.
            // Let's use black rectangles for PII.
            const svgRects = bboxes.map(bbox => {
                const [ymin, xmin, ymax, xmax] = bbox;
                // Convert 0-1000 to pixels
                const top = Math.floor((ymin / 1000) * h);
                const left = Math.floor((xmin / 1000) * w);
                const height = Math.floor(((ymax - ymin) / 1000) * h);
                const width = Math.floor(((xmax - xmin) / 1000) * w);
                return `<rect x="${left}" y="${top}" width="${width}" height="${height}" fill="black" />`;
            }).join('\n');
            const svgOverlay = `
                <svg width="${w}" height="${h}">
                    ${svgRects}
                </svg>
            `;
            const processedBuffer = await image
                .composite([{ input: Buffer.from(svgOverlay), blend: 'over' }])
                .png()
                .toBuffer();
            // 4. Upload
            const bucket = admin.storage().bucket();
            // We create a new file "processed_{timestamp}.png" to avoid cache issues or overwriting source if needed elsewhere (though architecture says strict privacy).
            // Architecture: "pixelate/blur that region in the stored image before saving to Cloud Storage" implies we assume the input was raw.
            // Let's save as `processed/${filename}`
            // Extract filename from URL or generate new
            const filename = `pii_scrubbed_${Date.now()}.png`;
            const file = bucket.file(`privacy_safe/${filename}`);
            await file.save(processedBuffer, { metadata: { contentType: 'image/png' } });
            await file.makePublic();
            // Should we delete the original? Architecture says "Privacy-First". 
            // If the original URL is public/signed, it's still accessible. 
            // We should PROBABLY ideally delete the old one, but for now let's just return the safe one.
            // The "Ghost Mode" feature later will handle strict deletion.
            const token = Math.random().toString(36).substring(2);
            // Construct public URL
            // const publicUrl = `https://storage.googleapis.com/${bucket.name}/privacy_safe/${filename}`; // Storage API style
            // Or Firebase style if makePublic() works. 
            // Actually `file.makePublic()` usage with `file.publicUrl()` is easier.
            return file.publicUrl();
        }
        catch (e) {
            firebase_functions_1.logger.error('[Scout] PII Blurring failed', e);
            throw new Error('Failed to scrub PII from image.');
        }
    }
}
exports.ScoutClient = ScoutClient;
