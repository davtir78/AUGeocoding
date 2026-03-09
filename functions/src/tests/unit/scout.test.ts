
import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import { ScoutClient } from '../../knowledge/scout';
import { callWithSafetyFallback } from '../../lib/safety';
import { ModelType } from '../../config/model-config';
import sharp from 'sharp';
import fetch from 'node-fetch';

// Mock Dependencies
jest.mock('../../lib/safety');
jest.mock('firebase-functions', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));
jest.mock('firebase-admin', () => ({
    storage: () => ({
        bucket: () => ({
            file: () => ({
                save: jest.fn(),
                makePublic: jest.fn(),
                publicUrl: () => 'https://mock-storage-url/privacy_safe/pii_scrubbed.png'
            })
        })
    })
}));
jest.mock('node-fetch', () => jest.fn());

// Mock Sharp
const mockSharpInstance = {
    metadata: (jest.fn() as any).mockResolvedValue({ width: 1000, height: 1000 }),
    composite: jest.fn().mockReturnThis(),
    png: jest.fn().mockReturnThis(),
    toBuffer: (jest.fn() as any).mockResolvedValue(Buffer.from('mock-image-buffer'))
};
// Use a factory function for mocking sharp correctly as it is often a default export
jest.mock('sharp', () => {
    return jest.fn(() => mockSharpInstance);
});


describe('ScoutClient Unit Tests', () => {
    let scout: ScoutClient;

    beforeEach(() => {
        jest.clearAllMocks();
        scout = new ScoutClient();
        // Default fetch mock
        (fetch as any).mockResolvedValue({
            arrayBuffer: (jest.fn() as any).mockResolvedValue(new ArrayBuffer(10))
        });
    });

    test('SC-03: Should correctly parse valid layout analysis', async () => {
        const mockResult = {
            artifact_type: 'worksheet',
            suggested_subject: 'Math',
            suggested_year: 'Year 9',
            regions: [
                { id: 'Q1', type: 'text', bbox: [100, 100, 200, 200], pii_detected: false }
            ],
            context_regions: []
        };

        (callWithSafetyFallback as any).mockResolvedValueOnce({
            choices: [{
                message: { content: JSON.stringify(mockResult) }
            }]
        });

        const { result, safeImageUrl } = await scout.detectLayoutAndPII('https://example.com/image.png');

        expect(result).toEqual(mockResult);
        expect(safeImageUrl).toBe('https://example.com/image.png'); // No PII, URL unchanged
    });

    test('SC-06: Should trigger PII Blurring and return new URL when PII detected', async () => {
        const mockResultWithPII = {
            artifact_type: 'worksheet',
            regions: [
                { id: 'Header', type: 'text', bbox: [0, 0, 100, 100], pii_detected: true, pii_bbox: [10, 10, 50, 50] }
            ]
        };

        (callWithSafetyFallback as any).mockResolvedValueOnce({
            choices: [{
                message: { content: JSON.stringify(mockResultWithPII) }
            }]
        });

        const { result, safeImageUrl } = await scout.detectLayoutAndPII('https://example.com/sensitive.png');

        // Verify PII detected
        expect(result.regions[0].pii_detected).toBe(true);

        // Verify Sharp was called to blackout region
        // Note: checking if mocked sharp constructor was called
        const sharpMock = require('sharp');
        expect(sharpMock).toHaveBeenCalled();
        expect(mockSharpInstance.composite).toHaveBeenCalled();

        // Verify new URL returned
        expect(safeImageUrl).toContain('privacy_safe');
        expect(safeImageUrl).not.toBe('https://example.com/sensitive.png');
    });

    test('Should throw error on Safety Double Refusal', async () => {
        // Mock safety returning null (double refusal)
        (callWithSafetyFallback as any).mockResolvedValueOnce(null);

        await expect(scout.detectLayoutAndPII('https://bad.png'))
            .rejects.toThrow('SAFETY_BLOCK');
    });
});
