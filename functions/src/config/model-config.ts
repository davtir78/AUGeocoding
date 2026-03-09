export enum ModelType {
    General = 0,
    Chat = 1,
    Review = 2,
    Vision = 3,
    ImageHigh = 4,
    ImageLow = 5,
    Uncensored = 6,
    ArtifactScout = 7,
    ArtifactTranscribe = 8,
    ArtifactStructure = 9,
}

export const MODEL_CONFIG = {
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
export function getModelsForType(type: ModelType): string[] {
    let category: { paid: string[], free: string[] } | undefined;

    switch (type) {
        case ModelType.General:
            category = MODEL_CONFIG.categories.general;
            break;
        case ModelType.Chat:
            category = MODEL_CONFIG.categories.chat;
            break;
        case ModelType.Review:
            category = MODEL_CONFIG.categories.review;
            break;
        case ModelType.Vision:
            category = MODEL_CONFIG.categories.vision;
            break;
        case ModelType.ImageHigh:
            category = MODEL_CONFIG.categories["image-high"];
            break;
        case ModelType.ImageLow:
            category = MODEL_CONFIG.categories["image-low"];
            break;
        case ModelType.Uncensored:
            category = (MODEL_CONFIG.categories as any).uncensored;
            break;
        case ModelType.ArtifactScout:
            category = (MODEL_CONFIG.categories as any)["artifact-scout"];
            break;
        case ModelType.ArtifactTranscribe:
            category = (MODEL_CONFIG.categories as any)["artifact-transcribe"];
            break;
        case ModelType.ArtifactStructure:
            category = (MODEL_CONFIG.categories as any)["artifact-structure"];
            break;
        default:
            category = MODEL_CONFIG.categories.general;
    }

    if (!category) return ["google/gemini-2.0-flash-exp:free"];

    return [...category.paid, ...category.free];
}

/**
 * Returns the single best default model for a given type.
 */
export function getDefaultModelForType(type: ModelType): string {
    const models = getModelsForType(type);
    return models.length > 0 ? models[0] : "google/gemini-2.0-flash-exp:free";
}

export function getChatStrategyModels(): string[] {
    return MODEL_CONFIG.routing.chat_strategy_models;
}
