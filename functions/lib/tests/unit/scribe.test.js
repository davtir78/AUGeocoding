"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
const scribe_1 = require("../../knowledge/scribe");
const safety_1 = require("../../lib/safety");
const node_fetch_1 = __importDefault(require("node-fetch"));
// Mock Dependencies
globals_1.jest.mock('../../lib/safety');
globals_1.jest.mock('firebase-functions', () => ({
    logger: {
        info: globals_1.jest.fn(),
        warn: globals_1.jest.fn(),
        error: globals_1.jest.fn(),
    },
}));
globals_1.jest.mock('firebase-admin', () => ({
    storage: () => ({
        bucket: () => ({
            file: () => ({
                save: globals_1.jest.fn(),
                makePublic: globals_1.jest.fn(),
                publicUrl: () => 'https://mock-storage/crop.png'
            })
        })
    })
}));
// Fix for ESM/CJS fetch issue
globals_1.jest.mock('node-fetch', () => globals_1.jest.fn());
// Mock Sharp
const mockSharpInstance = {
    metadata: globals_1.jest.fn().mockResolvedValue({ width: 1000, height: 1000 }),
    extract: globals_1.jest.fn().mockReturnThis(),
    toBuffer: globals_1.jest.fn().mockResolvedValue(Buffer.from('crop-buffer'))
};
globals_1.jest.mock('sharp', () => {
    return globals_1.jest.fn(() => mockSharpInstance);
});
(0, globals_1.describe)('ScribeClient Unit Tests', () => {
    let scribe;
    (0, globals_1.beforeEach)(() => {
        globals_1.jest.clearAllMocks();
        scribe = new scribe_1.ScribeClient();
        node_fetch_1.default.mockResolvedValue({
            arrayBuffer: globals_1.jest.fn().mockResolvedValue(new ArrayBuffer(10))
        });
    });
    (0, globals_1.test)('SCR-01: Soft Crop Calculation should add padding', async () => {
        // We can't easily inspect private method `createSoftCrop` directly without casting to any or exporting it.
        // Instead, we verify that sharp.extract was called with PADDED dimensions.
        // Input: [100, 100, 200, 200] (100x100 box)
        // Expected Padding: 15% of 100 = 15 pixels on each side.
        // Expected Extract: Left: 85, Top: 85, Width: 130, Height: 130.
        // Mock transcription success to allow method to proceed
        safety_1.callWithSafetyFallback.mockResolvedValueOnce({
            choices: [{
                    message: { content: JSON.stringify({ transcribed_text: "test", text_type: "printed" }) }
                }]
        });
        await scribe.transcribeRegion('https://img.png', [100, 100, 200, 200]);
        const extractCall = mockSharpInstance.extract.mock.calls[0][0];
        (0, globals_1.expect)(extractCall.left).toBe(85);
        (0, globals_1.expect)(extractCall.top).toBe(85);
        (0, globals_1.expect)(extractCall.width).toBe(130);
        (0, globals_1.expect)(extractCall.height).toBe(130);
    });
    (0, globals_1.test)('SCR-02: Transcribe Region returns structured result', async () => {
        const mockResponse = {
            transcribed_text: "The mitochondria is the powerhouse of the cell.",
            text_type: "printed",
            confidence: 0.99
        };
        safety_1.callWithSafetyFallback.mockResolvedValueOnce({
            choices: [{
                    message: { content: JSON.stringify(mockResponse) }
                }]
        });
        const result = await scribe.transcribeRegion('https://img.png', [0, 0, 100, 100]);
        (0, globals_1.expect)(result.transcribed_text).toBe(mockResponse.transcribed_text);
        (0, globals_1.expect)(result.text_type).toBe("printed");
        (0, globals_1.expect)(result.confidence).toBe(0.99);
    });
    (0, globals_1.test)('Safety Block should return redacted text', async () => {
        // Mock safety returning null (Double Refusal)
        safety_1.callWithSafetyFallback.mockResolvedValueOnce(null);
        const result = await scribe.transcribeRegion('https://bad.png', [0, 0, 100, 100]);
        (0, globals_1.expect)(result.transcribed_text).toContain("CONTENT REMOVED");
        (0, globals_1.expect)(result.confidence).toBe(0);
    });
});
