"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEmbedding = getEmbedding;
exports.findBestStandards = findBestStandards;
const curriculum_vectors_json_1 = __importDefault(require("../data/curriculum-vectors.json"));
const node_fetch_1 = __importDefault(require("node-fetch"));
/**
 * Fetches an embedding for the given text using OpenRouter.
 */
async function getEmbedding(text) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey)
        throw new Error('OPENROUTER_API_KEY not set');
    const response = await (0, node_fetch_1.default)('https://openrouter.ai/api/v1/embeddings', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://scholars-alley.com',
            'X-Title': 'Scholars Alley'
        },
        body: JSON.stringify({
            model: 'openai/text-embedding-3-small',
            input: text
        })
    });
    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Embedding API failed: ${response.status} ${err}`);
    }
    const data = await response.json();
    return data.data[0].embedding;
}
/**
 * Calculates cosine similarity between two vectors.
 */
function cosineSimilarity(vecA, vecB) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
/**
 * Finds the Top N most relevant curriculum standards for a given query embedding.
 */
function findBestStandards(queryEmbedding, limit = 5) {
    const list = Array.isArray(curriculum_vectors_json_1.default) ? curriculum_vectors_json_1.default : curriculum_vectors_json_1.default.default;
    if (!Array.isArray(list)) {
        console.error('Curriculum vectors is not an array:', typeof list);
        return [];
    }
    // 1. Calculate scores
    const scored = list.map(std => ({
        id: std.id,
        desc: std.desc,
        strand: std.strand,
        score: cosineSimilarity(queryEmbedding, std.embedding)
    }));
    // 2. Sort by score descending
    return scored
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
}
