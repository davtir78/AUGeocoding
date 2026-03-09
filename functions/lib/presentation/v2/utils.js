"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.callOpenRouter = callOpenRouter;
const firebase_functions_1 = require("firebase-functions");
const openrouter_1 = require("../../lib/openrouter");
const jsonrepair_1 = require("jsonrepair");
async function callOpenRouter(model, messages, responseSchema, // JSON schema for structured output
temperature = 0.7) {
    const options = {
        temperature,
        max_tokens: 4000,
    };
    if (responseSchema) {
        options.response_format = { type: "json_object" };
    }
    try {
        const data = await (0, openrouter_1.callOpenRouterWithFallback)(model, messages, options);
        const content = data.choices?.[0]?.message?.content;
        if (!content) {
            throw new Error('No content in OpenRouter response');
        }
        if (responseSchema) {
            try {
                // Sanitize content: remove markdown code blocks if present
                const cleanedContent = content.replace(/```json\s*|\s*```/g, '').trim();
                // Use jsonrepair to fix common LLM JSON issues (quotes, commmas, etc)
                const repaired = (0, jsonrepair_1.jsonrepair)(cleanedContent);
                return JSON.parse(repaired);
            }
            catch (e) {
                firebase_functions_1.logger.error('Failed to parse JSON from LLM response', { content });
                throw new Error('Invalid JSON response from LLM');
            }
        }
        return content;
    }
    catch (error) {
        firebase_functions_1.logger.error('Presentation LLM Call Error', error);
        throw error;
    }
}
