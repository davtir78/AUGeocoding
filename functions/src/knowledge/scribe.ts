
import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';
import sharp from 'sharp';
import fetch from 'node-fetch';
import { callWithSafetyFallback, SafetyError } from '../lib/safety';
import { ModelType } from '../config/model-config';
import { ScribeResult } from './schemas';

export class ScribeClient {
    constructor() { }

    /**
     * Stage 2: The Scribe
     * Extracts text from a specific region (Concept of "Focus Mode").
     * Handles "Soft Cropping" to include context.
     */
    async transcribeRegion(
        sourceImageUrl: string,
        bbox: [number, number, number, number],
        hint?: string
    ): Promise<ScribeResult> {

        // 1. Soft Crop
        const cropUrl = await this.createSoftCrop(sourceImageUrl, bbox);

        // 2. Transcribe
        const prompt = `You are an expert transcriber. 
        Task: Transcribe the text in this image VERBATIM.
        
        - If handwriting is present, tag it as <handwriting>...</handwriting>.
        - If printed text, tag as <printed>...</printed>.
        - Redact any PII (names, emails) with [REDACTED].
        - Maintain original formatting (lists, bullets) using Markdown.
        
        ${hint ? `Hint: This region contains ${hint}.` : ""}
        
        Return JSON: { "transcribed_text": "...", "text_type": "printed" | "handwriting", "confidence": 0-1 }`;

        try {
            const result = await callWithSafetyFallback(
                ModelType.ArtifactTranscribe,
                ModelType.Vision,
                [
                    { role: 'system', content: prompt },
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: "Transcribe this region." },
                            { type: 'image_url', image_url: { url: cropUrl } }
                        ]
                    }
                ],
                // We use json_object here, simplistic validation
                { response_format: { type: 'json_object' } }
            );

            if (!result) {
                logger.warn(`[Scribe] Transcription blocked by safety filter for region.`);
                return {
                    region_id: 'unknown',
                    transcribed_text: "[CONTENT REMOVED: SAFETY POLICY]",
                    text_type: 'printed',
                    confidence: 0,
                };
            }

            const content = JSON.parse(result.choices[0].message.content);
            return {
                region_id: 'unknown', // Set by caller
                transcribed_text: content.transcribed_text,
                text_type: content.text_type,
                confidence: content.confidence || 1.0
            };

        } catch (e: any) {
            logger.error(`[Scribe] Transcription failed`, e);
            // Return partial failure so other regions can succeed
            return {
                region_id: 'unknown',
                transcribed_text: "[TRANSCRIPTION FAILED]",
                text_type: 'printed',
                confidence: 0
            };
        }
    }

    /**
     * Creates a "Soft Crop" by expanding the bounding box by ~15% to capture context.
     */
    private async createSoftCrop(imageUrl: string, bbox: [number, number, number, number]): Promise<string> {
        try {
            const resp = await fetch(imageUrl);
            const buffer = Buffer.from(await resp.arrayBuffer());
            const image = sharp(buffer);
            const metadata = await image.metadata();

            const w = metadata.width || 1000;
            const h = metadata.height || 1000;

            // Unpack normalized bbox [ymin, xmin, ymax, xmax]
            let [ymin, xmin, ymax, xmax] = bbox;

            // 15% Padding logic (relative to element size)
            const height = ymax - ymin;
            const width = xmax - xmin;
            const padY = height * 0.15;
            const padX = width * 0.15;

            ymin = Math.max(0, ymin - padY);
            xmin = Math.max(0, xmin - padX);
            ymax = Math.min(1000, ymax + padY);
            xmax = Math.min(1000, xmax + padX);

            // Convert to pixels
            const top = Math.floor((ymin / 1000) * h);
            const left = Math.floor((xmin / 1000) * w);
            const cropH = Math.floor(((ymax - ymin) / 1000) * h);
            const cropW = Math.floor(((xmax - xmin) / 1000) * w);

            const cropBuffer = await image
                .extract({ left, top, width: cropW, height: cropH })
                .toBuffer();

            // Upload
            const bucket = admin.storage().bucket();
            const filename = `crops/soft_${Date.now()}_${Math.random().toString(36).substring(7)}.png`;
            const file = bucket.file(filename);
            await file.save(cropBuffer, { metadata: { contentType: 'image/png' } });
            await file.makePublic();

            return `https://storage.googleapis.com/${bucket.name}/${filename}`; // Consistent public URL

        } catch (e) {
            logger.warn(`[Scribe] Soft Crop failed. Using original.`, e);
            return imageUrl;
        }
    }

    /**
     * "Virtual Stitching": Sends TWO images (Part A, Part B) to the LLM to transcribe as one block.
     */
    async stitchAndTranscribe(url1: string, url2: string): Promise<string> {
        // Implementation for cross-page questions
        // Pass both URLs in the content array
        try {
            const result = await callWithSafetyFallback(
                ModelType.ArtifactTranscribe,
                ModelType.Vision,
                [
                    { role: 'system', content: "You are transcribing a question that spans two pages. Merge them into a single coherent text." },
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: "Part 1 (Start):" },
                            { type: 'image_url', image_url: { url: url1 } },
                            { type: 'text', text: "Part 2 (Continuation):" },
                            { type: 'image_url', image_url: { url: url2 } }
                        ]
                    }
                ]
            );
            return result.choices[0].message.content;
        } catch (e) {
            logger.error('[Scribe] Stitching failed', e);
            return "";
        }
    }
}
