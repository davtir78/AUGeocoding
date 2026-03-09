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
const admin = __importStar(require("firebase-admin"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// Inject API Key for Test
process.env.OPENROUTER_API_KEY = "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";
// Initialize Admin SDK *BEFORE* importing any other files that might use it
if (admin.apps.length === 0) {
    admin.initializeApp({
        projectId: 'scholars-alley-dev',
        credential: admin.credential.applicationDefault()
    });
}
async function testFlow() {
    console.log("Starting End-to-End Unit Test (Base64 Mode)...");
    // Dynamic import to avoid hoisting issues causing "default app does not exist"
    // We use require() here so it runs AFTER admin.initializeApp
    const { analyzeArtifact } = require('../knowledge/processArtifactUpload');
    const imagePath = path.resolve(__dirname, '../../../Docs/Assets/maths 1.png');
    if (!fs.existsSync(imagePath)) {
        console.error(`Image not found at: ${imagePath}`);
        return;
    }
    try {
        console.log(`Reading image as Base64...`);
        const bitmap = fs.readFileSync(imagePath);
        const base64 = bitmap.toString('base64');
        const dataUrl = `data:image/png;base64,${base64}`;
        console.log(`Image prepared (Base64 length: ${base64.length})`);
        const testData = {
            fileUrl: dataUrl, // Use Data URI for AI
            type: 'test_paper',
            sourceName: 'Unit Test Maths 1',
            yearLevel: '5'
        };
        const testUid = 'UNIT_TEST_USER';
        console.log("Invoking analyzeArtifact logic...");
        const result = await analyzeArtifact(testUid, testData);
        console.log("------------------------------------------------");
        console.log("SUCCESS! Result:", JSON.stringify(result, null, 2));
        console.log("------------------------------------------------");
    }
    catch (e) {
        console.error("TEST FAILED:", e);
    }
}
testFlow().catch(console.error);
