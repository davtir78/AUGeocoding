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
// Initialize Admin SDK (assumes default credentials or GOOGLE_APPLICATION_CREDENTIALS)
if (!admin.apps.length) {
    admin.initializeApp({
        projectId: 'scholars-alley-dev',
    });
}
const db = admin.firestore();
// Test Configuration
const TEST_USER_ID = 'test_integration_user'; // Mock user
const TEST_PRES_ID = 'integration_test_slide_scaling';
const RAW_CONTENT_WITHOUT_WRAPPER = `
# Slide 1
This is a test slide content without a wrapper.
`;
const SLEEP_MS = 2000;
const TIMEOUT_MS = 60000; // 60s timeout
async function runIntegrationTest() {
    console.log("--- Starting Presentation Processing Integration Test ---");
    // 1. Setup Test Document
    console.log(`Creating test presentation ${TEST_PRES_ID}...`);
    try {
        await db.collection('presentations').doc(TEST_PRES_ID).set({
            title: 'Integration Test Presentation',
            userId: TEST_USER_ID,
            status: 'fetched', // Trigger processing
            rawContent: RAW_CONTENT_WITHOUT_WRAPPER,
            slideCount: 1,
            theme: 'default',
            createdAt: new Date(),
            updatedAt: new Date()
        });
        console.log("Document created with status: 'fetched'");
    }
    catch (e) {
        console.error("Failed to create test document:", e);
        process.exit(1);
    }
    // 2. Poll for Completion
    console.log("Waiting for processing to complete...");
    let completed = false;
    let attempts = 0;
    const maxAttempts = TIMEOUT_MS / SLEEP_MS;
    while (!completed && attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, SLEEP_MS));
        const snap = await db.collection('presentations').doc(TEST_PRES_ID).get();
        if (!snap.exists)
            continue;
        const data = snap.data();
        if (data?.status === 'completed') {
            console.log("Processing completed!");
            // 3. Verify Output
            const slides = data.slides || [];
            if (slides.length === 0) {
                console.error("FAILED: No slides generated.");
                process.exit(1);
            }
            const html = slides[0].safeHtml || '';
            console.log("\n--- Checking Slide HTML ---");
            // console.log(html); // Debug
            let passed = true;
            // Check 1: Wrapper
            if (html.includes('<div class="slide"')) {
                console.log("[PASS] Slide wrapper found.");
            }
            else {
                console.error("[FAIL] Slide wrapper MISSING.");
                passed = false;
            }
            // Check 2: Script
            if (html.includes('function resizeSlide()')) {
                console.log("[PASS] Scaling script found.");
            }
            else {
                console.error("[FAIL] Scaling script MISSING.");
                passed = false;
            }
            // Check 3: Dark Background (in script)
            if (html.includes('document.body.style.backgroundColor = \'#0f172a\'')) {
                console.log("[PASS] Dark background style found.");
            }
            else {
                console.error("[FAIL] Dark background style MISSING.");
                passed = false;
            }
            if (passed) {
                console.log("\n✅ INTEGRATION TEST PASSED");
                process.exit(0);
            }
            else {
                console.error("\n❌ INTEGRATION TEST FAILED");
                process.exit(1);
            }
        }
        else if (data?.status === 'processing_failed') {
            console.error("Processing FAILED with error:", data.error);
            process.exit(1);
        }
        else {
            process.stdout.write('.');
        }
        attempts++;
    }
    console.error("\nTimeout waiting for processing.");
    process.exit(1);
}
runIntegrationTest();
