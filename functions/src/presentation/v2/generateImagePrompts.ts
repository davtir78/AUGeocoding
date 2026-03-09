import { callOpenRouter } from './utils';
import { z } from 'zod';
import { ModelType, getDefaultModelForType } from '../../config/model-config';

const ImagePromptsSchema = z.object({
    prompts: z.array(z.object({
        slideIndex: z.number(),
        prompt: z.string().describe("Detailed DALL-E 3 style image prompt. Do not include text in the image.")
    }))
});

/**
 * "Art Director" Pass:
 * Reviews the full presentation content and generates cohesive image prompts for each slide.
 * This runs AFTER content generation and BEFORE image generation.
 */
export async function generateImagePrompts(
    slides: { layoutId: string, content: any, detailedNotes: string, narrationScript: string }[],
    topic: string,
    theme?: string,
    ageGroup: string = "late-primary",
    model: string | string[] = getDefaultModelForType(ModelType.Chat)
) {
    // Filter slides that can actually hold an image
    // (We check if the schema typically has an 'image' field, or we just force it for standard layouts)
    // Intro, Problem (Concept), Bullet all have optional image fields.

    // We send a digest of the slides to the LLM
    const slidesDigest = slides.map((s, i) => ({
        index: i,
        layout: s.layoutId,
        title: s.content.title || "Untitled",
        contentSnippet: JSON.stringify(s.content).slice(0, 300) // Truncate for token efficiency
    }));

    const systemPrompt = `
        You are an expert Art Director for educational presentations.
        Your task is to visualize each slide and write a compelling, high-quality image generation prompt for it.

        Context:
        - Topic: ${topic}
        - Visual Theme: ${theme || "Modern, clean, colorful illustration"}
        - Target Audience Age Group: ${ageGroup}
        
        Guidelines:
        - Create prompts suitable for DALL-E 3 or Stable Diffusion.
        - Focus on visual metaphors, diagrams, or illustrative secenes.
        - Avoid asking for text inside the image (AI struggles with text).
        - Ensure the artistic complexity and metaphors are appropriate for the ${ageGroup} audience.
        - Avoid overly "childish" or "cartoonish" styles for high-school/university audiences unless it fits the theme.
        - Ensure a consistent artistic style across all slides.
        - Return prompts for ALL slides provided in the input.

        Output:
        JSON object satisfying:
        {
          "prompts": [
            { "slideIndex": 0, "prompt": "..." },
            ...
          ]
        }
    `;

    const userPrompt = `
        Here are the slides:
        ${JSON.stringify(slidesDigest, null, 2)}

        Generate image prompts now.
    `;

    try {
        const response = await callOpenRouter(
            model,
            [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            ImagePromptsSchema
        );

        const parsed = ImagePromptsSchema.parse(response);

        // Merge prompts back into slides
        const updatedSlides = [...slides];
        parsed.prompts.forEach(p => {
            if (updatedSlides[p.slideIndex]) {
                const slide = updatedSlides[p.slideIndex];

                // Ensure image object exists
                if (!slide.content.image) {
                    slide.content.image = {};
                }

                slide.content.image.imagePrompt = p.prompt;
            }
        });

        return updatedSlides;

    } catch (error) {
        console.error("[ImagePrompts] Failed to generate prompts", error);
        return slides; // Return original if failure
    }
}
