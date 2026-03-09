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
exports.ArchitectClient = void 0;
const admin = __importStar(require("firebase-admin"));
const firebase_functions_1 = require("firebase-functions");
const safety_1 = require("../lib/safety");
const model_config_1 = require("../config/model-config");
const schemas_1 = require("./schemas");
const jsonrepair_1 = require("jsonrepair");
class ArchitectClient {
    constructor() { }
    /**
     * Stage 4: The Architect
     * Structures raw text into a Knowledge Item, solves it (if printed), and generates distractors.
     */
    async constructKnowledgeItem(scribeResult, metadata, ragContext) {
        // 1. Prepare Prompt
        const isHandwriting = scribeResult.text_type === 'handwriting';
        const mode = isHandwriting ? "Extractor Mode" : "Solver Mode";
        firebase_functions_1.logger.info(`[Architect] VERIFY_DEPLOYMENT_V1: Strict=false. Validating Schema...`);
        firebase_functions_1.logger.info(`[Architect] SCHEMA_DUMP: ${JSON.stringify(schemas_1.KnowledgeItemJSONSchema)}`);
        let prompt = `You are an expert Australian Teacher.
        Task: Create a structured Knowledge Item from the provided text.
        
        Mode: ${mode}
        
        Input Text:
        "${scribeResult.transcribed_text}"
        
        Context:
        Subject: ${metadata.subject}
        Year Level: ${metadata.year}
        Relevant Standards: ${ragContext.standards.map((s) => s.desc).join('\n')}
        
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
            const llmResult = await (0, safety_1.callWithSafetyFallback)(model_config_1.ModelType.ArtifactStructure, model_config_1.ModelType.Chat, // Fallback to Gemini Pro/Flash Chat
            [
                { role: 'system', content: prompt },
                { role: 'user', content: "Build Knowledge Item." }
            ], {
                response_format: {
                    type: 'json_schema',
                    json_schema: {
                        name: 'knowledge_item',
                        strict: false,
                        schema: schemas_1.KnowledgeItemJSONSchema
                    }
                }
            });
            if (!llmResult) {
                firebase_functions_1.logger.warn(`[Architect] Structuring blocked by safety filter (Double Refusal).`);
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
                };
            }
            const content = llmResult.choices[0].message.content;
            const parsed = JSON.parse((0, jsonrepair_1.jsonrepair)(content));
            if (typeof parsed !== 'object' || parsed === null) {
                throw new Error("Parsed content is not a valid JSON object");
            }
            // 3. Post-Process / Validation
            // If Extractor Mode, ensure student_answer is populated from the text if LLM missed it or put it in description
            const item = {
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
        }
        catch (error) {
            firebase_functions_1.logger.error(`[Architect] Structuring failed`, error);
            // Return a "Failed" item rather than throwing, so we can save the raw text
            const failedItem = {
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
exports.ArchitectClient = ArchitectClient;
