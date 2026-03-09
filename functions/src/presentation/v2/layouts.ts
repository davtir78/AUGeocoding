import { z } from 'zod';

export const ImageSchema = z.object({
    imageUrl: z.string().optional().describe("URL to image"),
    imagePrompt: z.string().min(10).max(1000).describe("Prompt used to generate the image"),
});

export const IconSchema = z.object({
    iconUrl: z.string().optional().describe("URL to icon"),
    iconQuery: z.string().min(5).max(20).describe("Query used to search the icon"),
});

// Layout 1: Intro
export const IntroSlideSchema = z.object({
    title: z.string().min(2).max(50).describe("Main title of the slide"),
    description: z.string().optional().describe("Description or subtitle"),
    companyName: z.string().default("Scholars Alley"),
    date: z.string().optional(),
    image: ImageSchema.optional(),
    // Contact info skipped for now as not relevant for kids educational slides
});

// Layout 2: Problem (or Concept Introduction)
export const ProblemSlideSchema = z.object({
    title: z.string().min(3).max(30),
    description: z.string().min(20).max(200),
    categories: z.array(z.object({
        title: z.string(),
        description: z.string(),
        icon: IconSchema.optional(),
    })).min(1).max(3).describe("Key points or categories of the concept"),
    image: ImageSchema.optional(),
});

// Layout 3: Solution (or Concept Explanation)
export const SolutionSlideSchema = z.object({
    title: z.string(),
    mainDescription: z.string().min(20).max(300),
    sections: z.array(z.object({
        title: z.string(),
        description: z.string(),
        icon: IconSchema.optional(),
    })).min(2).max(4),
});

// Layout 4: Generic Content (Bullet Points)
export const BulletSlideSchema = z.object({
    title: z.string(),
    description: z.string().optional(),
    bullets: z.array(z.string()).min(1).max(10).describe("List of bullet points"),
    image: ImageSchema.optional().describe("Supporting image"),
});

export const LAYOUTS = [
    {
        id: "intro-slide",
        name: "Intro Slide",
        description: "A visually appealing introduction slide with a large title and subtitle. Always use this for the first slide.",
        schema: IntroSlideSchema,
    },
    {
        id: "concept-intro-slide", // Renamed from Problem for educational context
        name: "Concept Introduction",
        description: "Introduces a problem or concept with a main description and 2-3 key categories or points.",
        schema: ProblemSlideSchema,
    },
    {
        id: "concept-deep-dive-slide", // Renamed from Solution
        name: "Concept Deep Dive",
        description: "Explains a solution or concept in depth with a main description and 2-4 detailed sections/steps.",
        schema: SolutionSlideSchema,
    },
    {
        id: "bullet-points-slide",
        name: "Bullet Points with Image",
        description: "Standard slide for listing facts, steps, or characteristics with a supporting image.",
        schema: BulletSlideSchema,
    }
];
