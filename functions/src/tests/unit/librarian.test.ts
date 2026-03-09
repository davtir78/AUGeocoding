
import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import { LibrarianClient } from '../../knowledge/librarian';
import * as rag from '../../lib/rag';

jest.mock('node-fetch', () => jest.fn()); // Fix for ESM import in rag.ts
// Mock Firestore
const mockDb = {
    collection: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    get: jest.fn()
};
jest.mock('firebase-admin', () => ({
    firestore: () => mockDb
}));
jest.mock('firebase-functions', () => ({
    logger: { warn: jest.fn() }
}));
jest.mock('../../lib/rag');

describe('LibrarianClient Unit Tests', () => {
    let librarian: LibrarianClient;

    beforeEach(() => {
        jest.clearAllMocks();
        librarian = new LibrarianClient();
    });

    test('LIB-01: Duplicate Detection (Exact Match)', async () => {
        // Mock Embedding
        (rag.getEmbedding as any).mockResolvedValue([1, 0, 0]);
        // Mock Standards
        (rag.findBestStandards as any).mockReturnValue([]);

        // Mock Existing Items in Firstore
        (mockDb.get as any).mockResolvedValue({
            empty: false,
            docs: [{
                id: 'existing_doc_123',
                data: () => ({
                    reference_material_embedding: [1, 0, 0] // Identical vector
                })
            }]
        });

        const result = await librarian.enrichContext('user1', 'test text');

        expect(result.isDuplicate).toBe(true);
        expect(result.duplicates[0].id).toBe('existing_doc_123');
        // Cosine similarity of identical vectors is 1.0 > 0.95
        expect(result.duplicates[0].similarity).toBeCloseTo(1.0);
    });

    test('LIB-05: User Scope Isolation - duplicates checked only for current user', async () => {
        // Verify the Firestore query uses the correct UID filter
        (rag.getEmbedding as any).mockResolvedValue([1, 1, 1]);
        (mockDb.get as any).mockResolvedValue({ empty: true });

        await librarian.enrichContext('user_A', 'my secret notes');

        expect(mockDb.collection).toHaveBeenCalledWith('knowledge_items');
        expect(mockDb.where).toHaveBeenCalledWith('uid', '==', 'user_A');
    });

    test('Should return empty duplicates if embedding fails', async () => {
        (rag.getEmbedding as any).mockRejectedValue(new Error('API Error'));

        const result = await librarian.enrichContext('user1', 'fail text');

        expect(result.embedding).toEqual([]);
        expect(result.duplicates).toEqual([]);
        expect(result.isDuplicate).toBe(false);
    });
});
