"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enhanceInfographicPrompt = enhanceInfographicPrompt;
const utils_1 = require("../presentation/v2/utils");
const firebase_functions_1 = require("firebase-functions");
const model_config_1 = require("../config/model-config");
/**
 * Enhances a basic infographic request into a detailed "Art Director" brief
 * perfect for high-end image generation models (DALL-E 3, Flux, etc).
 */
async function enhanceInfographicPrompt(topic, dataContext, style, ageGroup = "late-primary") {
    const systemPrompt = `
    You are an expert Art Director for educational materials.
    Your goal is to take a simple request for an infographic and write a HIGHLY DETAILED, visual description
    that can be fed into an AI Image Generator (like DALL-E 3 or Flux) to produce a stunning result.
    
    # Guidelines
    - **Visual Hierarchy**: Define what is the central focal point.
    - **Layout**: Specify the layout (e.g., "Top-down flow", "Central hub", "timeline").
    - **Style Enforcement**: Strictly adhere to the requested style ("${style}").
    - **Text Handling**: AI models struggle with text. ONLY request the MAIN TITLE implementation. usage of icons/symbols for data points is preferred over text.
    - **Color Palette**: Describe the specific colors to use.
    - **Metaphor**: If complex data is provided, suggest a visual metaphor (e.g., "Use a tree to represent growth").
    
    # Output Format
    Return ONLY the raw prompt string. Do not include markdown framing or explanations.
    `;
    const userPrompt = `
    Create an image generation prompt for an infographic.
    
    **Topic**: ${topic}
    **Target Audience**: ${ageGroup} students.
    **Visual Style**: ${style}
    
    **Content/Data to Visualize**:
    ${dataContext.substring(0, 1500)}
    `;
    try {
        firebase_functions_1.logger.info(`[InfographicEnhance] Enhancing prompt for: ${topic}`);
        // We use a cheap but smart model for this enhancement/reasoning step
        const refinedPrompt = await (0, utils_1.callOpenRouter)((0, model_config_1.getDefaultModelForType)(model_config_1.ModelType.Chat), [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ]);
        if (!refinedPrompt || typeof refinedPrompt !== 'string') {
            throw new Error("Invalid response from Enhancer LLM");
        }
        firebase_functions_1.logger.info(`[InfographicEnhance] Prompt enhanced (Length: ${refinedPrompt.length} chars)`);
        return refinedPrompt.trim();
    }
    catch (error) {
        firebase_functions_1.logger.warn(`[InfographicEnhance] Failed to enhance prompt. Falling back to simple template.`, error);
        // Fallback Template
        return `
        A professional educational infographic about "${topic}".
        Style: ${style}.
        Target Audience: ${ageGroup}.
        Layout: Vertical, clear sections.
        Key Data: ${dataContext.substring(0, 300)}.
        High resolution, clean lines, colorful.
        `;
    }
}
