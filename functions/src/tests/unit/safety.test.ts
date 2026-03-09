
import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import { callWithSafetyFallback, SafetyError } from '../../lib/safety';
import { ModelType } from '../../config/model-config';
import * as openrouter from '../../lib/openrouter';

// Mock dependencies
jest.mock('node-fetch', () => jest.fn());
jest.mock('../../lib/openrouter');
jest.mock('firebase-functions', () => ({
    logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    },
}));

describe('Safety Fallback Logic', () => {
    // Explicitly type as any[] to bypass strict Message type checking in tests
    const mockMessages: any[] = [{ role: 'user', content: 'test message' }];
    const mockOptions = { temperature: 0.7 };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('SAF-01: Should return result from primary model if safe', async () => {
        // Mock successful response
        (openrouter.callOpenRouterAPI as any).mockResolvedValueOnce({
            choices: [{
                message: { content: 'Safe response' },
                finish_reason: 'stop'
            }]
        });

        const result = await callWithSafetyFallback(
            ModelType.ArtifactScout,
            ModelType.Vision,
            mockMessages,
            mockOptions
        );

        expect(result).toBeDefined();
        expect(result.choices[0].message.content).toBe('Safe response');
        // Only one call
        expect(openrouter.callOpenRouterAPI).toHaveBeenCalledTimes(1);
    });

    test('SAF-02: Should fallback to secondary model if primary triggers content_filter', async () => {
        // Mock primary failure (content_filter)
        (openrouter.callOpenRouterAPI as any)
            .mockResolvedValueOnce({
                choices: [{
                    message: { content: '' },
                    finish_reason: 'content_filter'
                }]
            })
            // Mock secondary success
            .mockResolvedValueOnce({
                choices: [{
                    message: { content: 'Fallback response' },
                    finish_reason: 'stop'
                }]
            });

        const result = await callWithSafetyFallback(
            ModelType.ArtifactScout,
            ModelType.Vision,
            mockMessages,
            mockOptions
        );

        expect(result).toBeDefined();
        expect(result.choices[0].message.content).toBe('Fallback response');

        // Two calls: Primary (fail) -> Fallback (success)
        expect(openrouter.callOpenRouterAPI).toHaveBeenCalledTimes(2);
    });

    test('SAF-03: Should return null if BOTH models fail (Double Refusal)', async () => {
        // Mock primary failure
        (openrouter.callOpenRouterAPI as any)
            .mockResolvedValueOnce({
                choices: [{ finish_reason: 'content_filter' }]
            })
            // Mock secondary failure
            .mockResolvedValueOnce({
                choices: [{ finish_reason: 'content_filter' }]
            });

        const result = await callWithSafetyFallback(
            ModelType.ArtifactScout,
            ModelType.Vision,
            mockMessages,
            mockOptions
        );

        expect(result).toBeNull();
        expect(openrouter.callOpenRouterAPI).toHaveBeenCalledTimes(2);
    });

    test('SAF-04: Should fallback if primary model refuses in text content', async () => {
        // Mock primary "soft refusal" in text
        (openrouter.callOpenRouterAPI as any)
            .mockResolvedValueOnce({
                choices: [{
                    message: { content: "I cannot process this image due to safety policy." },
                    finish_reason: "stop"
                }]
            })
            // Mock secondary success
            .mockResolvedValueOnce({
                choices: [{
                    message: { content: "Fallback success" },
                    finish_reason: "stop"
                }]
            });

        const result = await callWithSafetyFallback(
            ModelType.ArtifactScout,
            ModelType.Vision,
            mockMessages,
            mockOptions
        );

        expect(result.choices[0].message.content).toBe("Fallback success");
        expect(openrouter.callOpenRouterAPI).toHaveBeenCalledTimes(2);
    });

    test('Should throw non-safety errors immediately', async () => {
        // Mock network error
        (openrouter.callOpenRouterAPI as any).mockRejectedValueOnce(new Error('Network Timeout'));

        await expect(callWithSafetyFallback(
            ModelType.ArtifactScout,
            ModelType.Vision,
            mockMessages
        )).rejects.toThrow('Network Timeout');

        // Only one call, no fallback on technical error
        expect(openrouter.callOpenRouterAPI).toHaveBeenCalledTimes(1);
    });
});
