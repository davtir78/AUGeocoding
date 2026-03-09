"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
const architect_1 = require("../../knowledge/architect");
const safety_1 = require("../../lib/safety");
// Mock dependencies
globals_1.jest.mock('node-fetch', () => globals_1.jest.fn());
globals_1.jest.mock('../../lib/safety');
globals_1.jest.mock('firebase-functions', () => ({
    logger: {
        info: globals_1.jest.fn(),
        warn: globals_1.jest.fn(),
        error: globals_1.jest.fn(),
    },
}));
(0, globals_1.describe)('ArchitectClient Unit Tests', () => {
    let architect;
    (0, globals_1.beforeEach)(() => {
        globals_1.jest.clearAllMocks();
        architect = new architect_1.ArchitectClient();
    });
    (0, globals_1.test)('ARC-01: Should parse valid LLM response into KnowledgeItem', async () => {
        const mockLLMResponse = JSON.stringify({
            title: "Test Title",
            question_text: "What is 2+2?",
            ideal_answer: "4",
            explanation: "Math",
            subject: "Math",
            year_level: "Year 1",
            curriculum_code: "MATH101"
        });
        safety_1.callWithSafetyFallback.mockResolvedValueOnce({
            choices: [{
                    message: { content: mockLLMResponse }
                }]
        });
        const scribeResult = { region_id: '1', transcribed_text: '2+2?', text_type: 'printed', confidence: 1 };
        const metadata = { subject: 'Math', year: 'Year 1', sourceName: 'test.png' };
        const result = await architect.constructKnowledgeItem(scribeResult, metadata, { standards: [], duplicates: [] });
        (0, globals_1.expect)(result).not.toBeNull();
        (0, globals_1.expect)(result?.title).toBe("Test Title");
        (0, globals_1.expect)(result?.ideal_answer).toBe("4");
        (0, globals_1.expect)(result?.extraction_status).toBe("success");
    });
    (0, globals_1.test)('SAF-02: Double Refusal Handling (Safety Block)', async () => {
        // Mock Safety returning null (failed both models)
        safety_1.callWithSafetyFallback.mockResolvedValueOnce(null);
        const scribeResult = { region_id: '1', transcribed_text: 'Bad Text', text_type: 'printed', confidence: 1 };
        const metadata = { subject: 'Math', year: 'Year 1', sourceName: 'test.png' };
        const result = await architect.constructKnowledgeItem(scribeResult, metadata, { standards: [], duplicates: [] });
        (0, globals_1.expect)(result?.extraction_status).toBe("blocked_safety");
        (0, globals_1.expect)(result?.blocked_safety_reason).toContain("Double Refusal");
        // Ensure raw text is preserved even if blocked
        (0, globals_1.expect)(result?.extracted_text).toBe("Bad Text");
    });
    (0, globals_1.test)('Should handle malformed JSON gracefully', async () => {
        // LLM returns garbage
        safety_1.callWithSafetyFallback.mockResolvedValueOnce({
            choices: [{
                    message: { content: "I cannot answer this." } // Not JSON
                }]
        });
        const scribeResult = { region_id: '1', transcribed_text: 'Raw Input', text_type: 'printed', confidence: 1 };
        const metadata = { subject: 'Math', year: 'Year 1', sourceName: 'test.png' };
        const result = await architect.constructKnowledgeItem(scribeResult, metadata, { standards: [], duplicates: [] });
        // Architect uses 'jsonrepair', but if it fails completely it returns a "failed" item
        (0, globals_1.expect)(result?.extraction_status).toBe("failed");
        (0, globals_1.expect)(result?.title).toBe("Extraction Failed");
        (0, globals_1.expect)(result?.question_text).toBe("Raw Input"); // Fallback to raw
    });
});
