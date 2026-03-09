"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MODEL_CONFIG = exports.ModelType = void 0;
exports.getModelsForType = getModelsForType;
exports.getDefaultModelForType = getDefaultModelForType;
exports.getChatStrategyModels = getChatStrategyModels;
var ModelType;
(function (ModelType) {
    ModelType[ModelType["General"] = 0] = "General";
    ModelType[ModelType["Chat"] = 1] = "Chat";
    ModelType[ModelType["Review"] = 2] = "Review";
    ModelType[ModelType["Vision"] = 3] = "Vision";
    ModelType[ModelType["ImageHigh"] = 4] = "ImageHigh";
    ModelType[ModelType["ImageLow"] = 5] = "ImageLow";
    ModelType[ModelType["Uncensored"] = 6] = "Uncensored";
    ModelType[ModelType["ArtifactScout"] = 7] = "ArtifactScout";
    ModelType[ModelType["ArtifactTranscribe"] = 8] = "ArtifactTranscribe";
    ModelType[ModelType["ArtifactStructure"] = 9] = "ArtifactStructure";
})(ModelType || (exports.ModelType = ModelType = {}));
exports.MODEL_CONFIG = {
    categories: {
        general: {
            paid: [
                "google/gemini-2.0-pro-exp-02-05:free",
                "google/gemini-2.0-flash-001",
                "google/gemini-pro-1.5"
            ],
            free: [
                "google/gemma-2-9b-it",
                "google/gemma-2-27b-it"
            ]
        },
        chat: {
            paid: [
                "google/gemini-2.0-flash-001",
                "google/gemini-pro-1.5",
                "google/gemini-2.0-pro-exp-02-05:free"
            ],
            free: [
                "google/gemma-2-9b-it"
            ]
        },
        review: {
            paid: [
                "google/gemini-2.0-flash-001",
                "google/gemini-pro-1.5"
            ],
            free: [
                "google/gemma-2-9b-it"
            ]
        },
        vision: {
            paid: [
                "google/gemini-2.0-flash-001",
                "anthropic/claude-3.5-sonnet",
                "openai/gpt-4o",
                "google/gemini-pro-1.5"
            ],
            free: [
                "google/gemini-2.0-flash-exp:free"
            ]
        },
        uncensored: {
            paid: [
                "mistralai/mistral-large-2411"
            ],
            free: []
        },
        "image-high": {
            paid: [
                "google/gemini-2.0-flash-001",
                "openai/gpt-4o"
            ],
            free: []
        },
        "image-low": {
            paid: [
                "google/gemini-2.0-flash-001"
            ],
            free: []
        },
        "artifact-scout": {
            paid: [
                "google/gemini-2.0-flash-001",
                "google/gemini-pro-1.5"
            ],
            free: [
                "google/gemini-2.0-flash-exp:free"
            ]
        },
        "artifact-transcribe": {
            paid: [
                "google/gemini-2.0-flash-001",
                "anthropic/claude-3.5-sonnet",
                "openai/gpt-4o"
            ],
            free: []
        },
        "artifact-structure": {
            paid: [
                "openai/gpt-4o-mini",
                "google/gemini-2.0-flash-001"
            ],
            free: [
                "google/gemini-2.0-flash-exp:free"
            ]
        }
    },
    routing: {
        chat_strategy_models: [
            "google/gemini-2.0-flash-001",
            "google/gemini-pro-1.5"
        ]
    }
};
/**
 * Returns a list of preferred models for a given type.
 * Prioritizes paid models if available, then free.
 */
function getModelsForType(type) {
    let category;
    switch (type) {
        case ModelType.General:
            category = exports.MODEL_CONFIG.categories.general;
            break;
        case ModelType.Chat:
            category = exports.MODEL_CONFIG.categories.chat;
            break;
        case ModelType.Review:
            category = exports.MODEL_CONFIG.categories.review;
            break;
        case ModelType.Vision:
            category = exports.MODEL_CONFIG.categories.vision;
            break;
        case ModelType.ImageHigh:
            category = exports.MODEL_CONFIG.categories["image-high"];
            break;
        case ModelType.ImageLow:
            category = exports.MODEL_CONFIG.categories["image-low"];
            break;
        case ModelType.Uncensored:
            category = exports.MODEL_CONFIG.categories.uncensored;
            break;
        case ModelType.ArtifactScout:
            category = exports.MODEL_CONFIG.categories["artifact-scout"];
            break;
        case ModelType.ArtifactTranscribe:
            category = exports.MODEL_CONFIG.categories["artifact-transcribe"];
            break;
        case ModelType.ArtifactStructure:
            category = exports.MODEL_CONFIG.categories["artifact-structure"];
            break;
        default:
            category = exports.MODEL_CONFIG.categories.general;
    }
    if (!category)
        return ["google/gemini-2.0-flash-exp:free"];
    return [...category.paid, ...category.free];
}
/**
 * Returns the single best default model for a given type.
 */
function getDefaultModelForType(type) {
    const models = getModelsForType(type);
    return models.length > 0 ? models[0] : "google/gemini-2.0-flash-exp:free";
}
function getChatStrategyModels() {
    return exports.MODEL_CONFIG.routing.chat_strategy_models;
}
