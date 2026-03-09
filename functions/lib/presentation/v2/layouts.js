"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LAYOUTS = exports.BulletSlideSchema = exports.SolutionSlideSchema = exports.ProblemSlideSchema = exports.IntroSlideSchema = exports.IconSchema = exports.ImageSchema = void 0;
const zod_1 = require("zod");
exports.ImageSchema = zod_1.z.object({
    imageUrl: zod_1.z.string().optional().describe("URL to image"),
    imagePrompt: zod_1.z.string().min(10).max(1000).describe("Prompt used to generate the image"),
});
exports.IconSchema = zod_1.z.object({
    iconUrl: zod_1.z.string().optional().describe("URL to icon"),
    iconQuery: zod_1.z.string().min(5).max(20).describe("Query used to search the icon"),
});
// Layout 1: Intro
exports.IntroSlideSchema = zod_1.z.object({
    title: zod_1.z.string().min(2).max(50).describe("Main title of the slide"),
    description: zod_1.z.string().optional().describe("Description or subtitle"),
    companyName: zod_1.z.string().default("Scholars Alley"),
    date: zod_1.z.string().optional(),
    image: exports.ImageSchema.optional(),
    // Contact info skipped for now as not relevant for kids educational slides
});
// Layout 2: Problem (or Concept Introduction)
exports.ProblemSlideSchema = zod_1.z.object({
    title: zod_1.z.string().min(3).max(30),
    description: zod_1.z.string().min(20).max(200),
    categories: zod_1.z.array(zod_1.z.object({
        title: zod_1.z.string(),
        description: zod_1.z.string(),
        icon: exports.IconSchema.optional(),
    })).min(1).max(3).describe("Key points or categories of the concept"),
    image: exports.ImageSchema.optional(),
});
// Layout 3: Solution (or Concept Explanation)
exports.SolutionSlideSchema = zod_1.z.object({
    title: zod_1.z.string(),
    mainDescription: zod_1.z.string().min(20).max(300),
    sections: zod_1.z.array(zod_1.z.object({
        title: zod_1.z.string(),
        description: zod_1.z.string(),
        icon: exports.IconSchema.optional(),
    })).min(2).max(4),
});
// Layout 4: Generic Content (Bullet Points)
exports.BulletSlideSchema = zod_1.z.object({
    title: zod_1.z.string(),
    description: zod_1.z.string().optional(),
    bullets: zod_1.z.array(zod_1.z.string()).min(1).max(10).describe("List of bullet points"),
    image: exports.ImageSchema.optional().describe("Supporting image"),
});
exports.LAYOUTS = [
    {
        id: "intro-slide",
        name: "Intro Slide",
        description: "A visually appealing introduction slide with a large title and subtitle. Always use this for the first slide.",
        schema: exports.IntroSlideSchema,
    },
    {
        id: "concept-intro-slide", // Renamed from Problem for educational context
        name: "Concept Introduction",
        description: "Introduces a problem or concept with a main description and 2-3 key categories or points.",
        schema: exports.ProblemSlideSchema,
    },
    {
        id: "concept-deep-dive-slide", // Renamed from Solution
        name: "Concept Deep Dive",
        description: "Explains a solution or concept in depth with a main description and 2-4 detailed sections/steps.",
        schema: exports.SolutionSlideSchema,
    },
    {
        id: "bullet-points-slide",
        name: "Bullet Points with Image",
        description: "Standard slide for listing facts, steps, or characteristics with a supporting image.",
        schema: exports.BulletSlideSchema,
    }
];
