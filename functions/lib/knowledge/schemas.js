"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KnowledgeItemJSONSchema = exports.ScoutJSONSchema = void 0;
exports.ScoutJSONSchema = {
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
exports.KnowledgeItemJSONSchema = {
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
