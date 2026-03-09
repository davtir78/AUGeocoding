
import { Timestamp } from 'firebase-admin/firestore';

// --- STAGE 1: SCOUT SCHEMAS ---

export interface ScoutRegion {
    id: string; // "Q1", "Passage A"
    type: 'text' | 'image' | 'handwriting';
    bbox: [number, number, number, number]; // [ymin, xmin, ymax, xmax] 0-1000
    pii_detected: boolean;
    pii_bbox?: [number, number, number, number]; // Region to blur
    continues_on_next?: boolean; // Virtual Stitching flag
    brief_desc: string;
}

export interface ScoutResult {
    artifact_type: 'worksheet' | 'passage' | 'handwritten_notes' | 'textbook_page' | 'answer_key';
    suggested_subject: string;
    suggested_year: string;
    regions: ScoutRegion[];
    context_regions?: { id: string; bbox: [number, number, number, number]; brief_desc: string }[];
}

export const ScoutJSONSchema = {
    type: "object",
    properties: {
        artifact_type: { type: "string", enum: ["worksheet", "passage", "handwritten_notes", "textbook_page", "answer_key"] },
        suggested_subject: { type: "string" },
        suggested_year: { type: "string" },
        regions: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    id: { type: "string" },
                    type: { type: "string", enum: ["text", "image", "handwriting"] },
                    bbox: { type: "array", items: { type: "number" }, minItems: 4, maxItems: 4 },
                    pii_detected: { type: "boolean" },
                    pii_bbox: { type: "array", items: { type: "number" }, minItems: 4, maxItems: 4 },
                    continues_on_next: { type: "boolean" },
                    brief_desc: { type: "string" }
                },
                required: ["id", "type", "bbox", "brief_desc", "pii_detected"],
                additionalProperties: false
            }
        },
        context_regions: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    id: { type: "string" },
                    bbox: { type: "array", items: { type: "number" }, minItems: 4, maxItems: 4 },
                    brief_desc: { type: "string" }
                },
                required: ["id", "bbox", "brief_desc"],
                additionalProperties: false
            }
        }
    },
    required: ["artifact_type", "regions", "suggested_subject"],
    additionalProperties: false
};

// --- STAGE 2: SCRIBE SCHEMAS ---

export interface ScribeResult {
    region_id: string;
    transcribed_text: string;
    text_type: 'printed' | 'handwriting';
    confidence: number;
}

// --- DOCUMENT SCOUT (PDF) ---

export interface DocumentScoutResult {
    total_pages: number;
    page_map: {
        page: number;
        type: 'toc' | 'instruction' | 'questions' | 'answer_key';
        action: 'skip' | 'store_as_context' | 'process' | 'store_as_reference_image';
    }[];
}

// --- FINAL KNOWLEDGE ITEM (FIRESTORE) ---

export interface KnowledgeItem {
    id?: string;
    uid: string;
    title: string;
    extracted_text: string; // Combined question + context
    question_text: string;
    reference_material?: string; // The "Context" text (e.g. passage)
    reference_material_embedding?: number[]; // Vector for fuzzy grouping
    student_answer?: string;
    ideal_answer?: string; // AI Generated
    ideal_answer_override?: boolean; // Student manually marked AI wrong
    explanation?: string; // Step-by-step

    subject: string;
    year_level: string;
    strand?: string;
    curriculum_links?: { code: string; topic: string }[];

    mastery_status: 'banked' | 'needs_review' | 'mastered';
    extraction_status: 'success' | 'needs_clarification' | 'blocked_safety' | 'failed';
    blocked_safety_reason?: string;
    extraction_error?: string;
    clarification_question?: string;
    clarification_hint?: string;
    confidence_score?: number;
    debug_raw?: string;

    source_name: string;
    source_pages?: number[]; // For multi-page stitching
    source_image_url?: string; // Full page
    crop_image_url?: string; // Soft crop
    created_at: Timestamp;
}

export const KnowledgeItemJSONSchema = {
    type: "object",
    properties: {
        title: { type: "string" },
        question_text: { type: "string" },
        reference_material: { type: ["string", "null"] },
        student_answer: { type: ["string", "null"] },
        ideal_answer: { type: ["string", "null"] }, // Can be null in extractor mode
        explanation: { type: ["string", "null"] },
        subject: { type: "string" },
        year_level: { type: "string" },
        strand: { type: ["string", "null"] },
        curriculum_code: { type: ["string", "null"] }, // Helper for single code
        topic_tag: { type: ["string", "null"] }
    },
    // Strict Structured Outputs requires ALL properties to be required
    required: [
        "title",
        "question_text",
        "reference_material",
        "student_answer",
        "ideal_answer",
        "explanation",
        "subject",
        "year_level",
        "strand",
        "curriculum_code",
        "topic_tag"
    ],
    additionalProperties: false
};

// --- REFERENCE SHELF (ANSWER KEYS) ---

export interface ReferenceImage {
    id?: string;
    uid: string;
    source_name: string;
    document_type: 'answer_key' | 'instruction' | 'rubric';
    image_url: string;
    page_number: number;
    created_at: Timestamp;
}
