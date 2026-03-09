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
const analyzer_1 = require("../knowledge/analyzer");
// Initialize Admin if needed (although scripts usually need specific env setup)
if (!admin.apps.length) {
    admin.initializeApp({
        projectId: 'scholars-alley-dev',
        // credential: admin.credential.applicationDefault() // Rely on local auth
    });
}
// Mock auth context
const TEST_UID = 'test-user-verification';
async function runTest() {
    // 1. Setup paths
    const assetsDir = path.join(__dirname, '../../../Docs/Assets');
    const simpleImage = path.join(assetsDir, 'maths 1.png');
    const complexImage = path.join(assetsDir, 'maths olypiad.png');
    console.log('--- TEST 1: Simple Image (maths 1.png) ---');
    await testImage(simpleImage, 'Simple Math Test');
    console.log('\n\n--- TEST 2: Complex Image (maths olypiad.png) ---');
    await testImage(complexImage, 'Maths Olympiad');
}
async function testImage(filePath, sourceName) {
    if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        return;
    }
    // Convert to Base64 data URL for the API
    const bitmap = fs.readFileSync(filePath);
    const base64 = Buffer.from(bitmap).toString('base64');
    const dataUrl = `data:image/png;base64,${base64}`;
    console.log(`Analyzing ${path.basename(filePath)}...`);
    try {
        // Call the analyzer directly
        // Note: We might need to inject the API key if it relies on process.env which might be missing in simple node script
        if (!process.env.OPENROUTER_API_KEY) {
            console.warn("WARNING: OPENROUTER_API_KEY is not set in process.env. Test might fail.");
        }
        const result = await (0, analyzer_1.analyzeArtifact)(TEST_UID, {
            fileUrl: dataUrl,
            type: 'test_paper',
            sourceName: sourceName,
            yearLevel: '5'
        });
        console.log(`\nAnalysis Result for ${sourceName}:`);
        console.log(`Inferred Subject: ${result.inferredSubject}`);
        console.log(`Items Extracted: ${result.count}`);
        // We can't see the specific items because analyzeArtifact returns a summary, 
        // but the console.logs INSIDE analyzeArtifact will show the raw JSON. 
        // That's perfect for verification.
    }
    catch (e) {
        console.error(`Failed to analyze ${sourceName}:`, e);
    }
}
// Run
runTest().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
