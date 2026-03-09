import { z } from 'zod';

export const SlideOutlineSchema = z.object({
    title: z.string().describe("Title of the slide"),
    content: z.string().min(50).max(2000).describe("Markdown content for the slide"),
});

export const PresentationOutlineSchema = z.object({
    title: z.string().describe("A catchy, academic 'Course Name' style title for the presentation"),
    slides: z.array(SlideOutlineSchema).describe("List of slide outlines"),
});

export type SlideOutline = z.infer<typeof SlideOutlineSchema>;
export type PresentationOutline = z.infer<typeof PresentationOutlineSchema>;
