"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.refineContent = refineContent;
const utils_1 = require("./utils");
const zod_1 = require("zod");
const layouts_1 = require("./layouts");
// Discriminated Union to ensure content matches layoutId strictly
// Discriminated Union to ensure content matches layoutId strictly
const RefinedPresentationSchema = zod_1.z.object({
    slides: zod_1.z.array(zod_1.z.discriminatedUnion("layoutId", [
        zod_1.z.object({
            layoutId: zod_1.z.literal("intro-slide"),
            content: layouts_1.IntroSlideSchema,
            detailedNotes: zod_1.z.string().optional(),
            narrationScript: zod_1.z.string().optional()
        }),
        zod_1.z.object({
            layoutId: zod_1.z.literal("concept-intro-slide"),
            content: layouts_1.ProblemSlideSchema,
            detailedNotes: zod_1.z.string().optional(),
            narrationScript: zod_1.z.string().optional()
        }),
        zod_1.z.object({
            layoutId: zod_1.z.literal("concept-deep-dive-slide"),
            content: layouts_1.SolutionSlideSchema,
            detailedNotes: zod_1.z.string().optional(),
            narrationScript: zod_1.z.string().optional()
        }),
        zod_1.z.object({
            layoutId: zod_1.z.literal("bullet-points-slide"),
            content: layouts_1.BulletSlideSchema,
            detailedNotes: zod_1.z.string().optional(),
            narrationScript: zod_1.z.string().optional()
        })
    ]))
});
async function refineContent(slides, topic, instructions, model = 'openai/gpt-4o') {
    if (!slides || slides.length === 0)
        return slides;
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
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
    ];
    try {
        console.log("[Refine] Sending for review...");
        const response = await (0, utils_1.callOpenRouter)(model, messages, RefinedPresentationSchema);
        const parsed = RefinedPresentationSchema.parse(response);
        // Ensure we handle optional returns gracefully by merging with original if needed
        // But Zod parse guarantees matches, so we just cast to return type
        return parsed.slides;
    }
    catch (error) {
        console.error("[Refine] Failed to refine content, returning draft.", error);
        return slides; // Fallback to draft if refinement fails
    }
}
