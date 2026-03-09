import { logger } from 'firebase-functions';
import { callOpenRouterWithFallback, Message, OpenRouterRequest } from '../../lib/openrouter';
import { jsonrepair } from 'jsonrepair';

export async function callOpenRouter(
    model: string | string[],
    messages: Message[],
    responseSchema?: any, // JSON schema for structured output
    temperature: number = 0.7
): Promise<any> {

    const options: Omit<OpenRouterRequest, 'model' | 'messages'> = {
        temperature,
        max_tokens: 4000,
    };

    if (responseSchema) {
        options.response_format = { type: "json_object" };
    }

    try {
        const data = await callOpenRouterWithFallback(model, messages, options);
        const content = data.choices?.[0]?.message?.content;

        if (!content) {
            throw new Error('No content in OpenRouter response');
        }

        if (responseSchema) {
            try {
                // Sanitize content: remove markdown code blocks if present
                const cleanedContent = content.replace(/```json\s*|\s*```/g, '').trim();
                // Use jsonrepair to fix common LLM JSON issues (quotes, commmas, etc)
                const repaired = jsonrepair(cleanedContent);
                return JSON.parse(repaired);
            } catch (e) {
                logger.error('Failed to parse JSON from LLM response', { content });
                throw new Error('Invalid JSON response from LLM');
            }
        }

        return content;
    } catch (error) {
        logger.error('Presentation LLM Call Error', error);
        throw error;
    }
}
