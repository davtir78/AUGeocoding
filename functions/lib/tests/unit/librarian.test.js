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
const librarian_1 = require("../../knowledge/librarian");
const rag = __importStar(require("../../lib/rag"));
globals_1.jest.mock('node-fetch', () => globals_1.jest.fn()); // Fix for ESM import in rag.ts
// Mock Firestore
const mockDb = {
    collection: globals_1.jest.fn().mockReturnThis(),
    where: globals_1.jest.fn().mockReturnThis(),
    orderBy: globals_1.jest.fn().mockReturnThis(),
    limit: globals_1.jest.fn().mockReturnThis(),
    get: globals_1.jest.fn()
};
globals_1.jest.mock('firebase-admin', () => ({
    firestore: () => mockDb
}));
globals_1.jest.mock('firebase-functions', () => ({
    logger: { warn: globals_1.jest.fn() }
}));
globals_1.jest.mock('../../lib/rag');
(0, globals_1.describe)('LibrarianClient Unit Tests', () => {
    let librarian;
    (0, globals_1.beforeEach)(() => {
        globals_1.jest.clearAllMocks();
        librarian = new librarian_1.LibrarianClient();
    });
    (0, globals_1.test)('LIB-01: Duplicate Detection (Exact Match)', async () => {
        // Mock Embedding
        rag.getEmbedding.mockResolvedValue([1, 0, 0]);
        // Mock Standards
        rag.findBestStandards.mockReturnValue([]);
        // Mock Existing Items in Firstore
        mockDb.get.mockResolvedValue({
            empty: false,
            docs: [{
                    id: 'existing_doc_123',
                    data: () => ({
                        reference_material_embedding: [1, 0, 0] // Identical vector
                    })
                }]
        });
        const result = await librarian.enrichContext('user1', 'test text');
        (0, globals_1.expect)(result.isDuplicate).toBe(true);
        (0, globals_1.expect)(result.duplicates[0].id).toBe('existing_doc_123');
        // Cosine similarity of identical vectors is 1.0 > 0.95
        (0, globals_1.expect)(result.duplicates[0].similarity).toBeCloseTo(1.0);
    });
    (0, globals_1.test)('LIB-05: User Scope Isolation - duplicates checked only for current user', async () => {
        // Verify the Firestore query uses the correct UID filter
        rag.getEmbedding.mockResolvedValue([1, 1, 1]);
        mockDb.get.mockResolvedValue({ empty: true });
        await librarian.enrichContext('user_A', 'my secret notes');
        (0, globals_1.expect)(mockDb.collection).toHaveBeenCalledWith('knowledge_items');
        (0, globals_1.expect)(mockDb.where).toHaveBeenCalledWith('uid', '==', 'user_A');
    });
    (0, globals_1.test)('Should return empty duplicates if embedding fails', async () => {
        rag.getEmbedding.mockRejectedValue(new Error('API Error'));
        const result = await librarian.enrichContext('user1', 'fail text');
        (0, globals_1.expect)(result.embedding).toEqual([]);
        (0, globals_1.expect)(result.duplicates).toEqual([]);
        (0, globals_1.expect)(result.isDuplicate).toBe(false);
    });
});
