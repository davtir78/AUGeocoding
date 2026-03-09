import vectors from '../data/curriculum-vectors.json';
import fetch from 'node-fetch';

interface StandardVector {
    id: string;
    desc: string;
    strand: string;
    embedding: number[];
}

/**
 * Fetches an embedding for the given text using OpenRouter.
 */
export async function getEmbedding(text: string): Promise<number[]> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error('OPENROUTER_API_KEY not set');

    const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
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

    const data: any = await response.json();
    return data.data[0].embedding;
}

/**
 * Calculates cosine similarity between two vectors.
 */
function cosineSimilarity(vecA: number[], vecB: number[]): number {
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
export function findBestStandards(queryEmbedding: number[], limit: number = 5): any[] {
    const list = Array.isArray(vectors) ? vectors : (vectors as any).default;

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
