import { zodToJsonSchema } from 'zod-to-json-schema';
import { z } from 'zod';
import { callOpenRouter } from './utils';
import { LAYOUTS } from './layouts';
import { SlideOutline } from './schemas';
import { ModelType, getDefaultModelForType } from '../../config/model-config';

export async function generateSlideContent(
    slideOutline: SlideOutline,
    layoutId: string,
    language: string = "English",
    tone: string = "Educational",
    verbosity: string = "Standard",
    ageGroup: string = "late-primary",
    model: string | string[] = getDefaultModelForType(ModelType.General)
) {
    const layout = LAYOUTS.find(l => l.id === layoutId);
    if (!layout) {
        throw new Error(`Layout ${layoutId} not found`);
    }

    // Convert Zod schema to JSON schema for the prompt
    // WRAPPER: specific for Orator's Podium (Sprint 3.5)
    const wrappedSchema = z.object({
        visualContent: layout.schema as any,
        detailedNotes: z.string().describe("Academic, detailed paragraph explaining the slide's content in depth (for 'Read More'). ~100-150 words."),
        narrationScript: z.string().describe("Conversational, first-person narration script for this slide (~40-60 words). Spoken by a friendly tutor.")
    });

    const jsonSchema = zodToJsonSchema(wrappedSchema as any, "slideGeneration");

    const systemPrompt = `
        You are an educational content creator.
        Generate structured content for a presentation slide based on the provided outline and layout schema.
        
        # Target Audience
        ${ageGroup} students. Ensure vocabulary, conceptual depth, and tone are appropriate for this age.

        # Tone
        ${tone}

        # Verbosity
        ${verbosity}

        # Schema Validation
        You MUST output a valid JSON object that strictly adheres to the following JSON Schema:
        ${JSON.stringify(jsonSchema, null, 2)}

        # Formatting Instructions
        - Use Markdown notation (**bold**, *italics*) for emphasis within text fields.
        - STRICTLY FORBIDDEN: Do NOT use Headers (#) or Code Blocks within the text fields.
        - STRICTLY FORBIDDEN: Do NOT merge multiple points into a single long string. Use the JSON array for items.

        # Image/Icon Instructions
        - **MANDATORY**: If the schema allows an 'image' object, you MUST provide it.
        - For 'imagePrompt': Describe a clear, safe, child-friendly image. Use words like "illustration", "vector art", "colorful".
        - For '__icon_query__': Keywords to search for a relevant icon.

        # Orator's Podium Instructions
        - **detailedNotes**: Write a rich, academic explanation of the concept. This is for students who want to "Deep Dive".
        - **narrationScript**: Write a script for a Voice Actor. It should be engaging, conversational, and explanatory. Do not say "Slide Title". Just explain the concept naturally.
    `;

    const userPrompt = `
        # Slide Context
        - Title: "${slideOutline.title}"
            - Content Outline: "${slideOutline.content}"
                - Language: ${language}
        
        Generate the JSON content for this slide.
    `;

    const messages = [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: userPrompt }
    ];

    const response = await callOpenRouter(model, messages, wrappedSchema);

    // We try to parse it with Zod to ensure it matches
    let parsedVisual;
    let detailedNotes = "";
    let narrationScript = "";

    let parsedWrapper;
    let finalLayoutId = layoutId;
    let dataToParse: any = response;

    // Handle potential wrapping by LLM based on schema name
    if (dataToParse && typeof dataToParse === 'object') {
        if ('slideContent' in dataToParse) {
            dataToParse = dataToParse.slideContent;
        } else if ('definitions' in dataToParse && dataToParse.definitions?.slideContent) {
            dataToParse = dataToParse.definitions.slideContent;
        }
    }

    try {
        parsedWrapper = wrappedSchema.parse(dataToParse);
        parsedVisual = parsedWrapper.visualContent;
        detailedNotes = parsedWrapper.detailedNotes;
        narrationScript = parsedWrapper.narrationScript;
    } catch (error) {
        // Fallback Strategy: Try to extract visual content if wrapper failed
        // (This logic needs to be robust to handle partial failures)

        // ... existing fallback set parsedVisual ...
        // Fallback Strategy 1: Inject Title if missing
        if (slideOutline.title && typeof dataToParse === 'object' && dataToParse !== null) {
            dataToParse.title = slideOutline.title;
        }

        try {
            parsedVisual = layout.schema.parse(dataToParse);
            // If we recovered the visual content but lost the wrapper, we generate placeholders
            detailedNotes = slideOutline.content;
            narrationScript = slideOutline.content;
        } catch (retryError: any) {
            // Fallback Strategy 2: Convert to Bullet Points Layout
            // If the structure is totally wrong (hallucinated fields), we map what we have to a generic list.
            try {
                const title = dataToParse?.title || slideOutline.title || "Slide Title";
                const bullets: string[] = [];

                // Extract text aggressively from any structure
                const harvestText = (obj: any) => {
                    if (typeof obj === 'string') {
                        // Filter out common enum keys or structural artifacts that look like content
                        const artifacts = ['numberedList', 'bulletPoint', 'paragraph', 'heading', 'text', 'list', 'items', 'question', 'instruction', 'answer'];
                        if (obj.length > 3 && !artifacts.includes(obj)) {
                            bullets.push(obj);
                        }
                    } else if (Array.isArray(obj)) {
                        obj.forEach(harvestText);
                    } else if (typeof obj === 'object' && obj !== null) {
                        // Don't harvest keys, only values
                        Object.values(obj).forEach(harvestText);
                    }
                };

                // Harvest from specific known hallucinated fields first, then everything
                const contentFields = [dataToParse?.content, dataToParse?.items, dataToParse?.points, dataToParse?.sections, dataToParse?.categories];
                contentFields.forEach(f => {
                    if (f) harvestText(f);
                });

                // If still empty, try harvesting the whole object excluding title
                if (bullets.length === 0) {
                    const { title, ...rest } = dataToParse;
                    harvestText(rest);
                }

                // If no bullets found, split the outline content
                if (bullets.length === 0) {
                    bullets.push(...slideOutline.content.split('. ').map(s => s.trim()).filter(s => s.length > 5).slice(0, 5));
                }

                // Find Bullet Layout
                const bulletLayout = LAYOUTS.find(l => l.id === "bullet-points-slide");
                if (bulletLayout) {
                    parsedVisual = bulletLayout.schema.parse({
                        title,
                        bullets: bullets.slice(0, 6) // Schema max is 6
                    });
                    finalLayoutId = "bullet-points-slide";
                    // Fallback notes
                    if (!detailedNotes) detailedNotes = bullets.join(". ");
                    if (!narrationScript) narrationScript = `Here are the key points about ${title}. ` + bullets.join(". ");
                } else {
                    throw retryError; // Should not happen
                }

            } catch (fallbackError) {
                // If even fallback fails, we die with logs
                throw new Error(`Zod Error: ${retryError.message} | Fallback Failed: ${(fallbackError as any).message} | Raw: ${JSON.stringify(response)} `);
            }
        }
    }

    // Final Polish: Recursively clean strings (remove double bullets, headers)
    // We do this before returning to ensure clean data in DB.
    if (parsedVisual) {
        const cleanStrings = (obj: any): any => {
            if (typeof obj === 'string') {
                // 1. Strip markdown headers (e.g. "### Answers:")
                let cleaned = obj.replace(/^#+\s*/, '');
                // 2. Strip leading bullet characters (•, -, *)
                cleaned = cleaned.replace(/^[\s]*[•\-\*][\s]*/, '');
                return cleaned;
            } else if (Array.isArray(obj)) {
                return obj.map(cleanStrings);
            } else if (typeof obj === 'object' && obj !== null) {
                const newObj: any = {};
                for (const key in obj) {
                    newObj[key] = cleanStrings(obj[key]);
                }
                return newObj;
            }
            return obj;
        };
        try {
            parsedVisual = cleanStrings(parsedVisual);
        } catch (e) {
            // If cleaning fails, return original
        }
    }

    return {
        layoutId: finalLayoutId,
        content: parsedVisual,
        detailedNotes,
        narrationScript
    };
}
