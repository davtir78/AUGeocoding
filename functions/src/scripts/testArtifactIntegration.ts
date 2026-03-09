
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

const projectId = 'scholars-alley-dev';

if (!admin.apps.length) {
    admin.initializeApp({
        projectId: projectId
    });
}

const db = admin.firestore();

// Using the UID from davtir@hotmail.com as found in scripts/suite/config.js logic
const TEST_UID = 'dUzDRJkK7SOrtdGWBQi6ikrSyPk1';

interface TestArtifact {
    path: string;
    sourceName: string;
    difficulty: 'Simple' | 'Medium' | 'Hard';
}

const ARTIFACTS: TestArtifact[] = [
    /*
    {
        path: 'maths 1.png',
        sourceName: 'Automation Test: Simple Math',
        difficulty: 'Simple'
    },
    {
        path: 'maths 2 with image.png',
        sourceName: 'Automation Test: Medium Math',
        difficulty: 'Medium'
    },
    */
    {
        path: 'maths olypiad.png',
        sourceName: 'Automation Test: Hard Math',
        difficulty: 'Hard'
    }
];

async function runIntegrationTests() {
    console.log("🚀 Starting Artifact Integration Tests (using Base64)...");
    const assetsDir = path.join(__dirname, '../../../Docs/Assets');

    for (const artifact of ARTIFACTS) {
        console.log(`\n--- Testing ${artifact.difficulty} Artifact: ${artifact.path} ---`);
        const filePath = path.join(assetsDir, artifact.path);

        if (!fs.existsSync(filePath)) {
            console.error(`❌ File not found: ${filePath}`);
            continue;
        }

        // 1. Submit Job (Base64)
        console.log(`Step 1: Reading file and converting to Base64...`);
        const bitmap = fs.readFileSync(filePath);
        const base64 = Buffer.from(bitmap).toString('base64');
        const dataUrl = `data:image/png;base64,${base64}`;

        if (dataUrl.length > 950000) { // Safety check for Firestore document size limits
            console.warn(`⚠️ Image ${artifact.path} is large (${dataUrl.length} chars). Continuing anyway...`);
        }

        const jobRef = db.collection('generationJobs').doc();
        await jobRef.set({
            userId: TEST_UID,
            type: 'artifact',
            status: 'queued',
            input: {
                fileUrl: dataUrl,
                type: 'test_paper',
                sourceName: artifact.sourceName,
                yearLevel: '5'
            },
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`Step 2: Job created (${jobRef.id}) for UID ${TEST_UID}. Waiting for processing...`);

        // 2. Poll for Completion
        let status = 'queued';
        let attempts = 0;
        const maxAttempts = 60; // 10 minutes (10s intervals) for harder artifacts

        while (status === 'queued' || status === 'processing' || status === 'fetching' || status === 'fetched') {
            if (attempts >= maxAttempts) {
                console.error(`❌ Timeout waiting for job ${jobRef.id}`);
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 10000));
            const doc = await jobRef.get();
            status = doc.data()?.status;
            console.log(`Polling status: ${status}...`);
            attempts++;
        }

        if (status === 'completed') {
            console.log(`✅ Job ${jobRef.id} completed!`);

            // 3. Verify knowledge_items
            console.log("Step 3: Verifying extracted knowledge items...");
            // FIELD MATCHING: We must use the correct fields from analyzer.ts
            // uid, source_name, extracted_text, curriculum_links
            const itemsSnapshot = await db.collection('knowledge_items')
                .where('uid', '==', TEST_UID)
                .where('source_name', '==', artifact.sourceName)
                .get();

            console.log(`\n--- Verification Summary for ${artifact.sourceName} ---`);
            console.log(`Requirement Check: Minimum 5 Questions -> ${itemsSnapshot.size >= 5 ? '✅' : '❌'} (${itemsSnapshot.size} found)`);

            if (itemsSnapshot.empty) {
                console.error(`❌ No knowledge items found for ${artifact.sourceName}!`);
                console.log("   Check if the analyzer used a different inferred subject or source_name.");
            } else {
                console.log(`🎉 Found ${itemsSnapshot.size} items. Checking fields...`);
                let failedExtractions = 0;

                itemsSnapshot.forEach(doc => {
                    const data = doc.data();
                    const missing = [];

                    if (data.extraction_status === 'failed') {
                        failedExtractions++;
                        console.warn(`⚠️ Item ${doc.id} marked as EXTRACTION FAILED. Title: ${data.title}`);
                        return; // Skip detailed field checks for failed ones
                    }

                    if (!data.title) missing.push('title');
                    if (!data.subject) missing.push('subject');
                    if (!data.year_level) missing.push('year_level');
                    if (!data.strand) missing.push('strand');
                    if (!data.extracted_text) missing.push('extracted_text');
                    if (!data.student_answer && data.student_answer !== "") missing.push('student_answer');
                    if (!data.ideal_answer) missing.push('ideal_answer');
                    if (!data.explanation) missing.push('explanation');
                    if (!data.crop_image_url) missing.push('crop_image_url');
                    if (!data.source_image_url) missing.push('source_image_url');
                    if (!data.curriculum_links || data.curriculum_links.length === 0 || !data.curriculum_links[0].code) missing.push('curriculum_links[0].code');

                    if (missing.length > 0) {
                        console.error(`❌ Item ${doc.id} is missing fields: ${missing.join(', ')}`);
                        // Log first bit of data for debugging
                        console.log("   Data snapshot:", JSON.stringify(data).substring(0, 200));
                    } else {
                        console.log(`✅ Item ${doc.id} verification passed.`);
                        console.log(`   Title: ${data.title}`);
                        console.log(`   Images: [CROP] ${data.crop_image_url ? 'OK' : 'MISSING'} | [SOURCE] ${data.source_image_url ? 'OK' : 'MISSING'}`);
                        console.log(`   Extraction Status: ${data.extraction_status || 'legacy'}`);
                    }
                });

                if (failedExtractions > 0) {
                    console.log(`ℹ️ Total Discovered: ${itemsSnapshot.size}, Extraction Failed: ${failedExtractions}`);
                }

                if (artifact.path === 'maths olypiad.png' && itemsSnapshot.size < 5) {
                    console.error(`❌ Expected at least 5 items for Olympiad, but found only ${itemsSnapshot.size}. Discovery might be failing.`);
                }
            }
        } else {
            const doc = await jobRef.get();
            console.error(`❌ Job ${jobRef.id} failed with status: ${status}`);
            console.error(`   Error: ${doc.data()?.error}`);
        }
    }

    console.log("\n🏁 Integration Tests Finished.");
}

runIntegrationTests().catch(console.error);
