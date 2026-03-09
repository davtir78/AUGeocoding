import { callOpenRouter } from './utils';
import { z } from 'zod';
import {
    IntroSlideSchema,
    ProblemSlideSchema,
    SolutionSlideSchema,
    BulletSlideSchema
} from './layouts';

// Discriminated Union to ensure content matches layoutId strictly
// Discriminated Union to ensure content matches layoutId strictly
const RefinedPresentationSchema = z.object({
    slides: z.array(z.discriminatedUnion("layoutId", [
        z.object({
            layoutId: z.literal("intro-slide"),
            content: IntroSlideSchema,
            detailedNotes: z.string().optional(),
            narrationScript: z.string().optional()
        }),
        z.object({
            layoutId: z.literal("concept-intro-slide"),
            content: ProblemSlideSchema,
            detailedNotes: z.string().optional(),
            narrationScript: z.string().optional()
        }),
        z.object({
            layoutId: z.literal("concept-deep-dive-slide"),
            content: SolutionSlideSchema,
            detailedNotes: z.string().optional(),
            narrationScript: z.string().optional()
        }),
        z.object({
            layoutId: z.literal("bullet-points-slide"),
            content: BulletSlideSchema,
            detailedNotes: z.string().optional(),
            narrationScript: z.string().optional()
        })
    ]))
});

export async function refineContent(
    slides: { layoutId: string, content: any, detailedNotes: string, narrationScript: string }[],
    topic: string,
    instructions?: string,
    model: string | string[] = 'openai/gpt-4o'
) {
    if (!slides || slides.length === 0) return slides;

    const systemPrompt = `
        You are a meticulous Editor-in-Chief. Your job is to review and refine presentation slides for accuracy, flow, and completeness.

        ${instructions ? `# User Instruction:\n${instructions}\n` : ''}

        Input: A JSON array of slides (layoutId + content).
        Task: 
        1. Check for factual correctness.
        2. Ensure dates, names, and statistics are plausible/accurate.
        3. Improve clarity and impact of the text.
        4. Ensure the "flow" between slides is logical.
        5. Return the EXACT SAME JSON structure, but with the content fields improved.
        6. DO NOT change the 'layoutId'.
        7. DO NOT remove any slides.
        8. DO NOT remove key structural elements (like 'sections' arrays).

        Output Format:
        STRICT JSON object:
        Output Format:
        STRICT JSON object:
        {
          "slides": [
            { 
               "layoutId": "...", 
               "content": { ... },
               "detailedNotes": "Refined notes...",
               "narrationScript": "Refined script..." 
            }
          ]
        }
    `;

    const userPrompt = `
        **Presentation Topic:** ${topic}
        
        **Draft Slides:**
        ${JSON.stringify(slides, null, 2)}

        Please refine this content.
    `;

    const messages = [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: userPrompt }
    ];

    try {
        console.log("[Refine] Sending for review...");
        const response = await callOpenRouter(
            model,
            messages,
            RefinedPresentationSchema
        );

        const parsed = RefinedPresentationSchema.parse(response);

        // Ensure we handle optional returns gracefully by merging with original if needed
        // But Zod parse guarantees matches, so we just cast to return type
        return parsed.slides as { layoutId: string, content: any, detailedNotes: string, narrationScript: string }[];
    } catch (error) {
        console.error("[Refine] Failed to refine content, returning draft.", error);
        return slides; // Fallback to draft if refinement fails
    }
}
