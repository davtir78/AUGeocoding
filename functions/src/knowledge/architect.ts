
import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';
import { callWithSafetyFallback, SafetyError } from '../lib/safety';
import { ModelType } from '../config/model-config';
import { KnowledgeItem, KnowledgeItemJSONSchema, ScribeResult } from './schemas';
import { jsonrepair } from 'jsonrepair';

export class ArchitectClient {
    constructor() { }

    /**
     * Stage 4: The Architect
     * Structures raw text into a Knowledge Item, solves it (if printed), and generates distractors.
     */
    async constructKnowledgeItem(
        scribeResult: ScribeResult,
        metadata: { subject: string, year: string, sourceName: string },
        ragContext: { standards: any[], duplicates: any[] }
    ): Promise<KnowledgeItem | null> {

        // 1. Prepare Prompt
        const isHandwriting = scribeResult.text_type === 'handwriting';
        const mode = isHandwriting ? "Extractor Mode" : "Solver Mode";

        logger.info(`[Architect] VERIFY_DEPLOYMENT_V1: Strict=false. Validating Schema...`);
        logger.info(`[Architect] SCHEMA_DUMP: ${JSON.stringify(KnowledgeItemJSONSchema)}`);

        let prompt = `You are an expert Australian Teacher.
        Task: Create a structured Knowledge Item from the provided text.
        
        Mode: ${mode}
        
        Input Text:
        "${scribeResult.transcribed_text}"
        
        Context:
        Subject: ${metadata.subject}
        Year Level: ${metadata.year}
        Relevant Standards: ${ragContext.standards.map((s: any) => s.desc).join('\n')}
        
        Instructions:
        1. "question_text": The clear, standalone question. Include passage text if needed for context.
        2. "reference_material": If there is a long reading passage, extract it here.
        3. "ideal_answer": 
           - IF SOLVER MODE: Solve the question step-by-step. Provide the correct answer.
           - IF EXTRACTOR MODE: Leave null (we prioritize the student's own answer/mark).
        4. "explanation": Explain the solution or concept.
        5. "title": A short, searchable title (e.g. "Pythagoras Theorem - Finding C").
        6. "curriculum_code": Select the best matching code from the specific standards provided.
        `;

        if (isHandwriting) {
            prompt += `
            7. "student_answer": Extract the student's handwritten answer text here.
            `;
        }

        // 2. Call LLM
        try {
            const llmResult = await callWithSafetyFallback(
                ModelType.ArtifactStructure,
                ModelType.Chat, // Fallback to Gemini Pro/Flash Chat
                [
                    { role: 'system', content: prompt },
                    { role: 'user', content: "Build Knowledge Item." }
                ],
                {
                    response_format: {
                        type: 'json_schema',
                        json_schema: {
                            name: 'knowledge_item',
                            strict: false,
                            schema: KnowledgeItemJSONSchema
                        }
                    }
                }
            );

            if (!llmResult) {
                logger.warn(`[Architect] Structuring blocked by safety filter (Double Refusal).`);
                return {
                    uid: '',
                    title: 'Content Blocked',
                    extracted_text: scribeResult.transcribed_text,
                    question_text: 'Content blocked by safety policy.',
                    source_name: metadata.sourceName,
                    subject: metadata.subject,
                    year_level: metadata.year,
                    mastery_status: 'needs_review',
                    extraction_status: 'blocked_safety', // Ensure this status exists in schema
                    blocked_safety_reason: 'AI Double Refusal',
                    created_at: admin.firestore.Timestamp.now()
                } as KnowledgeItem;
            }

            const content = llmResult.choices[0].message.content;
            const parsed = JSON.parse(jsonrepair(content));

            if (typeof parsed !== 'object' || parsed === null) {
                throw new Error("Parsed content is not a valid JSON object");
            }

            // 3. Post-Process / Validation
            // If Extractor Mode, ensure student_answer is populated from the text if LLM missed it or put it in description

            const item: KnowledgeItem = {
                uid: '', // Set by caller
                title: parsed.title,
                extracted_text: scribeResult.transcribed_text,
                question_text: parsed.question_text,
                reference_material: parsed.reference_material,
                student_answer: parsed.student_answer || '',
                ideal_answer: parsed.ideal_answer || '',
                explanation: parsed.explanation || '',
                subject: metadata.subject,
                year_level: metadata.year,
                strand: parsed.strand || '',
                curriculum_links: parsed.curriculum_code ? [{ code: parsed.curriculum_code, topic: parsed.topic_tag || '' }] : [],
                mastery_status: 'needs_review',
                extraction_status: 'success',
                source_name: metadata.sourceName || 'Unknown',
                created_at: admin.firestore.Timestamp.now()
            };

            return item;

        } catch (error: any) {
            logger.error(`[Architect] Structuring failed`, error);
            // Return a "Failed" item rather than throwing, so we can save the raw text
            const failedItem: KnowledgeItem = {
                uid: '',
                title: 'Extraction Failed',
                extracted_text: scribeResult.transcribed_text,
                question_text: scribeResult.transcribed_text, // Fallback to raw
                source_name: metadata.sourceName,
                subject: metadata.subject,
                year_level: metadata.year,
                mastery_status: 'needs_review',
                extraction_status: 'failed',
                extraction_error: error.message,
                created_at: admin.firestore.Timestamp.now()
            };
            return failedItem;
        }
    }
}
