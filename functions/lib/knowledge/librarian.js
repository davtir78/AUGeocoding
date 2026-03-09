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
exports.LibrarianClient = void 0;
const admin = __importStar(require("firebase-admin"));
const firebase_functions_1 = require("firebase-functions");
const rag_1 = require("../lib/rag");
class LibrarianClient {
    constructor() {
        this.db = admin.firestore();
    }
    /**
     * Stage 3: The Librarian
     * Grounding, Duplication Check, and Standard Linking.
     */
    async enrichContext(uid, text, subjectHint) {
        // 1. Generate Embedding
        let embedding = [];
        try {
            embedding = await (0, rag_1.getEmbedding)(text);
        }
        catch (e) {
            firebase_functions_1.logger.warn(`[Librarian] Embedding generation failed.`, e);
            // Fallback: Use empty embedding, skip vectors
        }
        // 2. Find Curriculum Standards
        const standards = embedding.length > 0 ? (0, rag_1.findBestStandards)(embedding, 5) : [];
        // 3. Check for Duplicates (User Scope)
        // Optimization: Only fetch last 50 items for this user to check against.
        // In production, this should be a Vector DB query.
        const recentItemsSnap = await this.db.collection('knowledge_items')
            .where('uid', '==', uid)
            .orderBy('created_at', 'desc')
            .limit(50)
            .get();
        const duplicates = [];
        if (embedding.length > 0 && !recentItemsSnap.empty) {
            for (const doc of recentItemsSnap.docs) {
                const item = doc.data();
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
    cosineSimilarity(vecA, vecB) {
        if (vecA.length !== vecB.length)
            return 0;
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
exports.LibrarianClient = LibrarianClient;
