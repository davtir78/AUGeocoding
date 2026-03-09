import { callOpenRouter } from './utils';
import { PresentationOutline } from './schemas';
import { LAYOUTS } from './layouts';
import { z } from 'zod';

const LayoutAssignmentSchema = z.object({
    slides: z.array(z.string()).describe("List of layout IDs corresponding to the slide index")
});

export async function assignLayouts(outline: PresentationOutline, instructions?: string, model: string | string[] = 'openai/gpt-4o-mini') {
    const nSlides = outline.slides.length;

    // Construct string representation of available layouts
    const layoutsDesc = LAYOUTS.map(l => `- ID: "${l.id}"\n  Name: ${l.name}\n  Description: ${l.description}`).join("\n\n");

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
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: userPrompt }
    ];

    const response = await callOpenRouter(model, messages, LayoutAssignmentSchema);
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
