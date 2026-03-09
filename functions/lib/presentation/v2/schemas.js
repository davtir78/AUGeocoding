"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PresentationOutlineSchema = exports.SlideOutlineSchema = void 0;
const zod_1 = require("zod");
exports.SlideOutlineSchema = zod_1.z.object({
    title: zod_1.z.string().describe("Title of the slide"),
    content: zod_1.z.string().min(50).max(2000).describe("Markdown content for the slide"),
});
exports.PresentationOutlineSchema = zod_1.z.object({
    title: zod_1.z.string().describe("A catchy, academic 'Course Name' style title for the presentation"),
    slides: zod_1.z.array(exports.SlideOutlineSchema).describe("List of slide outlines"),
});
