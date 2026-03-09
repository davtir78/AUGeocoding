
import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import { ArchitectClient } from '../../knowledge/architect';
import { callWithSafetyFallback } from '../../lib/safety';

// Mock dependencies
jest.mock('node-fetch', () => jest.fn());
jest.mock('../../lib/safety');
jest.mock('firebase-functions', () => ({
    logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    },
}));

describe('ArchitectClient Unit Tests', () => {
    let architect: ArchitectClient;

    beforeEach(() => {
        jest.clearAllMocks();
        architect = new ArchitectClient();
    });

    test('ARC-01: Should parse valid LLM response into KnowledgeItem', async () => {
        const mockLLMResponse = JSON.stringify({
            title: "Test Title",
            question_text: "What is 2+2?",
            ideal_answer: "4",
            explanation: "Math",
            subject: "Math",
            year_level: "Year 1",
            curriculum_code: "MATH101"
        });

        (callWithSafetyFallback as any).mockResolvedValueOnce({
            choices: [{
                message: { content: mockLLMResponse }
            }]
        });

        const scribeResult = { region_id: '1', transcribed_text: '2+2?', text_type: 'printed', confidence: 1 };
        const metadata = { subject: 'Math', year: 'Year 1', sourceName: 'test.png' };

        const result = await architect.constructKnowledgeItem(scribeResult as any, metadata, { standards: [], duplicates: [] });

        expect(result).not.toBeNull();
        expect(result?.title).toBe("Test Title");
        expect(result?.ideal_answer).toBe("4");
        expect(result?.extraction_status).toBe("success");
    });

    test('SAF-02: Double Refusal Handling (Safety Block)', async () => {
        // Mock Safety returning null (failed both models)
        (callWithSafetyFallback as any).mockResolvedValueOnce(null);

        const scribeResult = { region_id: '1', transcribed_text: 'Bad Text', text_type: 'printed', confidence: 1 };
        const metadata = { subject: 'Math', year: 'Year 1', sourceName: 'test.png' };

        const result = await architect.constructKnowledgeItem(scribeResult as any, metadata, { standards: [], duplicates: [] });

        expect(result?.extraction_status).toBe("blocked_safety");
        expect(result?.blocked_safety_reason).toContain("Double Refusal");
        // Ensure raw text is preserved even if blocked
        expect(result?.extracted_text).toBe("Bad Text");
    });

    test('Should handle malformed JSON gracefully', async () => {
        // LLM returns garbage
        (callWithSafetyFallback as any).mockResolvedValueOnce({
            choices: [{
                message: { content: "I cannot answer this." } // Not JSON
            }]
        });

        const scribeResult = { region_id: '1', transcribed_text: 'Raw Input', text_type: 'printed', confidence: 1 };
        const metadata = { subject: 'Math', year: 'Year 1', sourceName: 'test.png' };

        const result = await architect.constructKnowledgeItem(scribeResult as any, metadata, { standards: [], duplicates: [] });

        // Architect uses 'jsonrepair', but if it fails completely it returns a "failed" item
        expect(result?.extraction_status).toBe("failed");
        expect(result?.title).toBe("Extraction Failed");
        expect(result?.question_text).toBe("Raw Input"); // Fallback to raw
    });
});
