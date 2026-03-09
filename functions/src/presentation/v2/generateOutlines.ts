import { callOpenRouter } from './utils';
import { PresentationOutlineSchema } from './schemas';

/**
 * Generates the presentation outline (slides content) using an LLM.
 */
export async function generateOutlines(
  topic: string,
  nSlides: number,
  language: string = 'English',
  additionalContext?: string,
  tone?: string,
  verbosity?: string,
  instructions?: string,
  includeTitleSlide: boolean = true,
  ageGroup: string = 'late-primary',
  model: string | string[] = 'openai/gpt-4o-mini'
) {
  const systemPrompt = `
        You are an expert presentation creator. Generate structured presentations based on user requirements and format them according to the specified JSON schema.

        ${instructions ? `# User Instruction:\n${instructions}\n` : ''}
        ${tone ? `# Tone:\n${tone}\n` : ''}
        ${verbosity ? `# Verbosity:\n${verbosity}\n` : ''}
        # Target Audience Age Group:
        Ensure the content complexity, vocabulary, and educational depth are perfectly tailored for the ${ageGroup} age group.

        - Provide content for each slide in markdown format.
        - The JSON output must strictly follow this schema:
          {
            "title": "Course Name / Presentation Title",
            "slides": [
              { 
                "title": "Slide Title", 
                "content": "Markdown content string..." 
              }
            ]
          }
        - The "slides" array MUST have exactly ${nSlides} items.
        - The top-level "title" should be a formal, engaging "Course Name" (e.g., "The Rise of Rome: From Republic to Empire").

        - Make sure that flow of the presentation is logical and consistent.
        - Place greater emphasis on numerical data.
        - If Additional Information is provided, divide it into slides.
        - **IMPORTANT**: For every slide where it makes sense (especially Concept and Bullet slides), include an "image" object with a detailed "imagePrompt" describing a relevant visual.
        - Make sure that content follows language guidelines.
        - User instruction should always be followed and should supercede any other instruction.
        - Do not generate table of contents slide.
        ${includeTitleSlide ? '- Always make first slide a title slide.' : '- Do not include title slide in the presentation.'}

        Start your response with the JSON object.
    `;

  const userPrompt = `
        **Input:**
        - User provided content/topic: ${topic || "Create presentation"}
        - Output Language: ${language}
        - Number of Slides: ${nSlides}
        - Current Date and Time: ${new Date().toISOString()}
        - Additional Information: ${additionalContext || ""}
    `;

  // We ask for JSON object. 
  // We can pass the schema description in the system prompt (done above).
  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: userPrompt }
  ];

  // Call LLM
  // We use google/gemini-flash-1.5 or openai/gpt-4o-mini for speed/cost if available, 
  // but let's default to a good instruction follower.
  // The user project has 'google/gemini-flash-1.5' in openrouterProxy usually.
  // Using 'google/gemini-flash-1.5' is good for cost.

  const response = await callOpenRouter(
    model,
    messages,
    PresentationOutlineSchema // This triggers response_format: { type: "json_object" } inside utils
  );

  // Validate with Zod
  const parsed = PresentationOutlineSchema.parse(response);

  // Enforce nSlides if LLM failed to count (Optional specific fixup logic could go here)
  if (parsed.slides.length !== nSlides) {
    // Basic fix: truncate or extend? 
    // For now, let's just warn or let it be flexible. 
    // The calling code might need to handle it.
  }

  return parsed;
}
