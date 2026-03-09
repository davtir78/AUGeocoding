"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
const safety_1 = require("../../lib/safety");
const model_config_1 = require("../../config/model-config");
const openrouter = __importStar(require("../../lib/openrouter"));
// Mock dependencies
globals_1.jest.mock('node-fetch', () => globals_1.jest.fn());
globals_1.jest.mock('../../lib/openrouter');
globals_1.jest.mock('firebase-functions', () => ({
    logger: {
        info: globals_1.jest.fn(),
        warn: globals_1.jest.fn(),
        error: globals_1.jest.fn(),
    },
}));
(0, globals_1.describe)('Safety Fallback Logic', () => {
    // Explicitly type as any[] to bypass strict Message type checking in tests
    const mockMessages = [{ role: 'user', content: 'test message' }];
    const mockOptions = { temperature: 0.7 };
    (0, globals_1.beforeEach)(() => {
        globals_1.jest.clearAllMocks();
    });
    (0, globals_1.test)('SAF-01: Should return result from primary model if safe', async () => {
        // Mock successful response
        openrouter.callOpenRouterAPI.mockResolvedValueOnce({
            choices: [{
                    message: { content: 'Safe response' },
                    finish_reason: 'stop'
                }]
        });
        const result = await (0, safety_1.callWithSafetyFallback)(model_config_1.ModelType.ArtifactScout, model_config_1.ModelType.Vision, mockMessages, mockOptions);
        (0, globals_1.expect)(result).toBeDefined();
        (0, globals_1.expect)(result.choices[0].message.content).toBe('Safe response');
        // Only one call
        (0, globals_1.expect)(openrouter.callOpenRouterAPI).toHaveBeenCalledTimes(1);
    });
    (0, globals_1.test)('SAF-02: Should fallback to secondary model if primary triggers content_filter', async () => {
        // Mock primary failure (content_filter)
        openrouter.callOpenRouterAPI
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
        const result = await (0, safety_1.callWithSafetyFallback)(model_config_1.ModelType.ArtifactScout, model_config_1.ModelType.Vision, mockMessages, mockOptions);
        (0, globals_1.expect)(result).toBeDefined();
        (0, globals_1.expect)(result.choices[0].message.content).toBe('Fallback response');
        // Two calls: Primary (fail) -> Fallback (success)
        (0, globals_1.expect)(openrouter.callOpenRouterAPI).toHaveBeenCalledTimes(2);
    });
    (0, globals_1.test)('SAF-03: Should return null if BOTH models fail (Double Refusal)', async () => {
        // Mock primary failure
        openrouter.callOpenRouterAPI
            .mockResolvedValueOnce({
            choices: [{ finish_reason: 'content_filter' }]
        })
            // Mock secondary failure
            .mockResolvedValueOnce({
            choices: [{ finish_reason: 'content_filter' }]
        });
        const result = await (0, safety_1.callWithSafetyFallback)(model_config_1.ModelType.ArtifactScout, model_config_1.ModelType.Vision, mockMessages, mockOptions);
        (0, globals_1.expect)(result).toBeNull();
        (0, globals_1.expect)(openrouter.callOpenRouterAPI).toHaveBeenCalledTimes(2);
    });
    (0, globals_1.test)('SAF-04: Should fallback if primary model refuses in text content', async () => {
        // Mock primary "soft refusal" in text
        openrouter.callOpenRouterAPI
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
        const result = await (0, safety_1.callWithSafetyFallback)(model_config_1.ModelType.ArtifactScout, model_config_1.ModelType.Vision, mockMessages, mockOptions);
        (0, globals_1.expect)(result.choices[0].message.content).toBe("Fallback success");
        (0, globals_1.expect)(openrouter.callOpenRouterAPI).toHaveBeenCalledTimes(2);
    });
    (0, globals_1.test)('Should throw non-safety errors immediately', async () => {
        // Mock network error
        openrouter.callOpenRouterAPI.mockRejectedValueOnce(new Error('Network Timeout'));
        await (0, globals_1.expect)((0, safety_1.callWithSafetyFallback)(model_config_1.ModelType.ArtifactScout, model_config_1.ModelType.Vision, mockMessages)).rejects.toThrow('Network Timeout');
        // Only one call, no fallback on technical error
        (0, globals_1.expect)(openrouter.callOpenRouterAPI).toHaveBeenCalledTimes(1);
    });
});
