
import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import { ScribeClient } from '../../knowledge/scribe';
import { callWithSafetyFallback } from '../../lib/safety';
import { ModelType } from '../../config/model-config';
import sharp from 'sharp';
import fetch from 'node-fetch';

// Mock Dependencies
jest.mock('../../lib/safety');
jest.mock('firebase-functions', () => ({
    logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    },
}));
jest.mock('firebase-admin', () => ({
    storage: () => ({
        bucket: () => ({
            file: () => ({
                save: jest.fn(),
                makePublic: jest.fn(),
                publicUrl: () => 'https://mock-storage/crop.png'
            })
        })
    })
}));

// Fix for ESM/CJS fetch issue
jest.mock('node-fetch', () => jest.fn());

// Mock Sharp
const mockSharpInstance = {
    metadata: (jest.fn() as any).mockResolvedValue({ width: 1000, height: 1000 }),
    extract: jest.fn().mockReturnThis(),
    toBuffer: (jest.fn() as any).mockResolvedValue(Buffer.from('crop-buffer'))
};
jest.mock('sharp', () => {
    return jest.fn(() => mockSharpInstance);
});

describe('ScribeClient Unit Tests', () => {
    let scribe: ScribeClient;

    beforeEach(() => {
        jest.clearAllMocks();
        scribe = new ScribeClient();
        (fetch as any).mockResolvedValue({
            arrayBuffer: (jest.fn() as any).mockResolvedValue(new ArrayBuffer(10))
        });
    });

    test('SCR-01: Soft Crop Calculation should add padding', async () => {
        // We can't easily inspect private method `createSoftCrop` directly without casting to any or exporting it.
        // Instead, we verify that sharp.extract was called with PADDED dimensions.
        // Input: [100, 100, 200, 200] (100x100 box)
        // Expected Padding: 15% of 100 = 15 pixels on each side.
        // Expected Extract: Left: 85, Top: 85, Width: 130, Height: 130.

        // Mock transcription success to allow method to proceed
        (callWithSafetyFallback as any).mockResolvedValueOnce({
            choices: [{
                message: { content: JSON.stringify({ transcribed_text: "test", text_type: "printed" }) }
            }]
        });

        await scribe.transcribeRegion('https://img.png', [100, 100, 200, 200]);

        const extractCall = (mockSharpInstance.extract as jest.Mock).mock.calls[0][0] as any;
        expect(extractCall.left).toBe(85);
        expect(extractCall.top).toBe(85);
        expect(extractCall.width).toBe(130);
        expect(extractCall.height).toBe(130);
    });

    test('SCR-02: Transcribe Region returns structured result', async () => {
        const mockResponse = {
            transcribed_text: "The mitochondria is the powerhouse of the cell.",
            text_type: "printed",
            confidence: 0.99
        };

        (callWithSafetyFallback as any).mockResolvedValueOnce({
            choices: [{
                message: { content: JSON.stringify(mockResponse) }
            }]
        });

        const result = await scribe.transcribeRegion('https://img.png', [0, 0, 100, 100]);

        expect(result.transcribed_text).toBe(mockResponse.transcribed_text);
        expect(result.text_type).toBe("printed");
        expect(result.confidence).toBe(0.99);
    });

    test('Safety Block should return redacted text', async () => {
        // Mock safety returning null (Double Refusal)
        (callWithSafetyFallback as any).mockResolvedValueOnce(null);

        const result = await scribe.transcribeRegion('https://bad.png', [0, 0, 100, 100]);

        expect(result.transcribed_text).toContain("CONTENT REMOVED");
        expect(result.confidence).toBe(0);
    });
});
