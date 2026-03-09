
import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';
import { getEmbedding, findBestStandards } from '../lib/rag';
import { KnowledgeItem } from './schemas';

export class LibrarianClient {
    private db: admin.firestore.Firestore;

    constructor() {
        this.db = admin.firestore();
    }

    /**
     * Stage 3: The Librarian
     * Grounding, Duplication Check, and Standard Linking.
     */
    async enrichContext(uid: string, text: string, subjectHint?: string) {
        // 1. Generate Embedding
        let embedding: number[] = [];
        try {
            embedding = await getEmbedding(text);
        } catch (e) {
            logger.warn(`[Librarian] Embedding generation failed.`, e);
            // Fallback: Use empty embedding, skip vectors
        }

        // 2. Find Curriculum Standards
        const standards = embedding.length > 0 ? findBestStandards(embedding, 5) : [];

        // 3. Check for Duplicates (User Scope)
        // Optimization: Only fetch last 50 items for this user to check against.
        // In production, this should be a Vector DB query.
        const recentItemsSnap = await this.db.collection('knowledge_items')
            .where('uid', '==', uid)
            .orderBy('created_at', 'desc')
            .limit(50)
            .get();

        const duplicates: { id: string, similarity: number }[] = [];

        if (embedding.length > 0 && !recentItemsSnap.empty) {
            for (const doc of recentItemsSnap.docs) {
                const item = doc.data() as KnowledgeItem;
                if (item.reference_material_embedding) {
                    const sim = this.cosineSimilarity(embedding, item.reference_material_embedding);
                    if (sim > 0.95) { // Strict threshold for "Duplicate"
                        duplicates.push({ id: doc.id, similarity: sim });
                    }
                }
            }
        }

        return {
            embedding,
            standards,
            duplicates,
            isDuplicate: duplicates.length > 0
        };
    }

    private cosineSimilarity(vecA: number[], vecB: number[]): number {
        if (vecA.length !== vecB.length) return 0;
        let dot = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < vecA.length; i++) {
            dot += vecA[i] * vecB[i];
            normA += vecA[i] * vecA[i];
            normB += vecB[i] * vecB[i];
        }
        return dot / (Math.sqrt(normA) * Math.sqrt(normB));
    }
}
