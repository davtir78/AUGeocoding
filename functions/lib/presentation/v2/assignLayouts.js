"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assignLayouts = assignLayouts;
const utils_1 = require("./utils");
const layouts_1 = require("./layouts");
const zod_1 = require("zod");
const LayoutAssignmentSchema = zod_1.z.object({
    slides: zod_1.z.array(zod_1.z.string()).describe("List of layout IDs corresponding to the slide index")
});
async function assignLayouts(outline, instructions, model = 'openai/gpt-4o-mini') {
    const nSlides = outline.slides.length;
    // Construct string representation of available layouts
    const layoutsDesc = layouts_1.LAYOUTS.map(l => `- ID: "${l.id}"\n  Name: ${l.name}\n  Description: ${l.description}`).join("\n\n");
    const systemPrompt = `
        You are a professional presentation designer.
        Select the most appropriate layout ID for each slide in the presentation based on its content.

        # Available Layouts
        ${layoutsDesc}

        # Rules
        1. The first slide MUST be "intro-slide".
        2. Use a variety of layouts to keep the presentation engaging.
        3. Match the content density to the layout capacity (e.g., if many points, use bullet-points-slide).
        4. "concept-intro-slide" is good for introducing 3 main points.
        5. "concept-deep-dive-slide" is good for detailed steps or sections.

        ${instructions ? `# User Instructions:\n${instructions}\n` : ''}

        Return a JSON object with a "slides" array containing exactly ${nSlides} layout IDs.
    `;
    const userPrompt = `
        # Presentation Outline
        ${outline.slides.map((s, i) => `Slide ${i + 1}: ${s.content}`).join("\n")}
    `;
    const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
    ];
    const response = await (0, utils_1.callOpenRouter)(model, messages, LayoutAssignmentSchema);
    const parsed = LayoutAssignmentSchema.parse(response);
    // Fallback/Validation if length mismatch
    if (parsed.slides.length !== nSlides) {
        // Simple fill
        while (parsed.slides.length < nSlides) {
            parsed.slides.push("bullet-points-slide");
        }
        parsed.slides = parsed.slides.slice(0, nSlides);
    }
    return parsed.slides; // Array of layoutIds
}
