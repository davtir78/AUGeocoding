"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
const scout_1 = require("../../knowledge/scout");
const safety_1 = require("../../lib/safety");
const node_fetch_1 = __importDefault(require("node-fetch"));
// Mock Dependencies
globals_1.jest.mock('../../lib/safety');
globals_1.jest.mock('firebase-functions', () => ({
    logger: { info: globals_1.jest.fn(), warn: globals_1.jest.fn(), error: globals_1.jest.fn() }
}));
globals_1.jest.mock('firebase-admin', () => ({
    storage: () => ({
        bucket: () => ({
            file: () => ({
                save: globals_1.jest.fn(),
                makePublic: globals_1.jest.fn(),
                publicUrl: () => 'https://mock-storage-url/privacy_safe/pii_scrubbed.png'
            })
        })
    })
}));
globals_1.jest.mock('node-fetch', () => globals_1.jest.fn());
// Mock Sharp
const mockSharpInstance = {
    metadata: globals_1.jest.fn().mockResolvedValue({ width: 1000, height: 1000 }),
    composite: globals_1.jest.fn().mockReturnThis(),
    png: globals_1.jest.fn().mockReturnThis(),
    toBuffer: globals_1.jest.fn().mockResolvedValue(Buffer.from('mock-image-buffer'))
};
// Use a factory function for mocking sharp correctly as it is often a default export
globals_1.jest.mock('sharp', () => {
    return globals_1.jest.fn(() => mockSharpInstance);
});
(0, globals_1.describe)('ScoutClient Unit Tests', () => {
    let scout;
    (0, globals_1.beforeEach)(() => {
        globals_1.jest.clearAllMocks();
        scout = new scout_1.ScoutClient();
        // Default fetch mock
        node_fetch_1.default.mockResolvedValue({
            arrayBuffer: globals_1.jest.fn().mockResolvedValue(new ArrayBuffer(10))
        });
    });
    (0, globals_1.test)('SC-03: Should correctly parse valid layout analysis', async () => {
        const mockResult = {
            artifact_type: 'worksheet',
            suggested_subject: 'Math',
            suggested_year: 'Year 9',
            regions: [
                { id: 'Q1', type: 'text', bbox: [100, 100, 200, 200], pii_detected: false }
            ],
            context_regions: []
        };
        safety_1.callWithSafetyFallback.mockResolvedValueOnce({
            choices: [{
                    message: { content: JSON.stringify(mockResult) }
                }]
        });
        const { result, safeImageUrl } = await scout.detectLayoutAndPII('https://example.com/image.png');
        (0, globals_1.expect)(result).toEqual(mockResult);
        (0, globals_1.expect)(safeImageUrl).toBe('https://example.com/image.png'); // No PII, URL unchanged
    });
    (0, globals_1.test)('SC-06: Should trigger PII Blurring and return new URL when PII detected', async () => {
        const mockResultWithPII = {
            artifact_type: 'worksheet',
            regions: [
                { id: 'Header', type: 'text', bbox: [0, 0, 100, 100], pii_detected: true, pii_bbox: [10, 10, 50, 50] }
            ]
        };
        safety_1.callWithSafetyFallback.mockResolvedValueOnce({
            choices: [{
                    message: { content: JSON.stringify(mockResultWithPII) }
                }]
        });
        const { result, safeImageUrl } = await scout.detectLayoutAndPII('https://example.com/sensitive.png');
        // Verify PII detected
        (0, globals_1.expect)(result.regions[0].pii_detected).toBe(true);
        // Verify Sharp was called to blackout region
        // Note: checking if mocked sharp constructor was called
        const sharpMock = require('sharp');
        (0, globals_1.expect)(sharpMock).toHaveBeenCalled();
        (0, globals_1.expect)(mockSharpInstance.composite).toHaveBeenCalled();
        // Verify new URL returned
        (0, globals_1.expect)(safeImageUrl).toContain('privacy_safe');
        (0, globals_1.expect)(safeImageUrl).not.toBe('https://example.com/sensitive.png');
    });
    (0, globals_1.test)('Should throw error on Safety Double Refusal', async () => {
        // Mock safety returning null (double refusal)
        safety_1.callWithSafetyFallback.mockResolvedValueOnce(null);
        await (0, globals_1.expect)(scout.detectLayoutAndPII('https://bad.png'))
            .rejects.toThrow('SAFETY_BLOCK');
    });
});
