export const LessonDraftSchema = {
    type: "object",
    properties: {
        course: {
            type: "object",
            properties: {
                title: { type: "string" },
                description: { type: "string" }
            },
            required: ["title", "description"],
            additionalProperties: false
        },
        sections: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    title: { type: "string" },
                    summary: { type: "string" },
                    learningObjectives: {
                        type: "array",
                        items: { type: "string" }
                    }
                },
                required: ["title", "summary", "learningObjectives"],
                additionalProperties: false
            }
        }
    },
    required: ["course", "sections"],
    additionalProperties: false
};

export const KnowledgeItemSchema = {
    type: "object",
    properties: {
        title: { type: "string" },
        question_text: { type: "string" },
        reference_material: { type: "string" }, // For long passages or context
        student_answer: { type: "string" },
        ideal_answer: { type: "string" },
        explanation: { type: "string" },
        status: { type: "string", enum: ["correct", "incorrect", "unanswered"] },
        curriculum_code: { type: "string" },
        strand: { type: "string" },
        topic_tag: { type: "string" }
    },
    required: ["title", "question_text", "status", "ideal_answer", "explanation"],
    additionalProperties: false
};

export const ScoutSchema = {
    type: "object",
    properties: {
        inferred_subject: { type: "string" },
        clarification_requested: { type: "string" }, // Optional clarifying question if ambiguous
        questions: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    id: { type: "string" },
                    bbox: {
                        type: "array",
                        items: { type: "number" },
                        minItems: 4,
                        maxItems: 4
                    },
                    brief_desc: { type: "string" }
                },
                required: ["id", "bbox", "brief_desc"],
                additionalProperties: false
            }
        }
    },
    required: ["inferred_subject", "questions"],
    additionalProperties: false
};
