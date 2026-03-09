
import * as admin from 'firebase-admin';

// Initialize Firebase Admin
// Note: This relies on GOOGLE_APPLICATION_CREDENTIALS being set OR
// running in an environment with default usage (like emulators or authenticated gcloud session)
if (!admin.apps.length) {
    try {
        admin.initializeApp({
            projectId: 'scholars-alley-dev'
        });
    } catch (error) {
        console.error("Failed to initialize admin. Ensure you are logged in via 'gcloud auth application-default login' or have a key file set.", error);
        process.exit(1);
    }
}
const db = admin.firestore();

async function runTest() {
    console.log('[Test] Starting Course Generation Integration Test (Multi-Pass Verification)...');

    const userId = 'test-verification-user';
    const jobId = 'test-job-verify-' + Date.now();
    const jobRef = db.collection('generationJobs').doc(jobId);

    // 1. Create Job with Specific Models (using free tier for test speed/cost)
    console.log(`[Test] Creating Job ${jobId}...`);
    // Using a reliable model name for testing
    const testModel = 'google/gemini-2.0-flash-exp:free';

    await jobRef.set({
        userId,
        type: 'course',
        status: 'queued',
        input: {
            topic: 'Photosynthesis',
            subject: 'Science',
            gradeLevel: 'Year 7',
            preferredModels: [testModel],
            presentationModels: [testModel],
            quizModels: [testModel],
            ageGroup: '11-13'
        },
        createdAt: new Date(),
        updatedAt: new Date()
    });

    console.log('[Test] Job Queued. Polling for completion...');

    let status = 'queued';
    let attempts = 0;
    const maxAttempts = 180; // Allow 6 minutes (presentation gen takes time)

    while (status !== 'completed' && status !== 'failed' && attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 2000));
        const snap = await jobRef.get();
        if (!snap.exists) {
            console.error('[Test] Job doc disappeared!');
            process.exit(1);
        }

        const data = snap.data();
        status = data?.status || 'unknown';
        const error = data?.error;

        // Visual feedback
        if (attempts % 5 === 0) process.stdout.write('.');

        if (status === 'failed') {
            console.log('\n[Test] Job FAILED.');
            console.error('Error Details:', error);
            process.exit(1);
        }

        attempts++;
    }
    console.log(`\n[Test] Final Job Status: ${status}`);

    if (status !== 'completed') {
        console.error('[Test] Timeout waiting for job completion.');
        process.exit(1);
    }

    // 3. Verification
    const jobData = (await jobRef.get()).data();
    const courseId = jobData?.courseId;
    if (!courseId) {
        console.error('[Test] No Course ID found in completed job.');
        process.exit(1);
    }
    console.log(`[Test] Course Created: ${courseId}`);

    const sectionsSnap = await db.collection('courses').doc(courseId).collection('sections').get();
    console.log(`[Test] Found ${sectionsSnap.size} sections.`);

    if (sectionsSnap.empty) {
        console.error('[Test] Course has no sections.');
        process.exit(1);
    }

    let passCount = 0;
    for (const section of sectionsSnap.docs) {
        const data = section.data();
        console.log(`\n[Section] ${data.title}`);

        if (!data.presentationId) {
            console.error('  [FAIL] Missing presentationId');
            continue;
        }

        const presRef = db.collection('presentations').doc(data.presentationId);
        const presSnap = await presRef.get();

        if (!presSnap.exists) {
            console.error(`  [FAIL] Presentation doc ${data.presentationId} does not exist.`);
        } else {
            const presData = presSnap.data();
            console.log(`  [PASS] Presentation linked (${data.presentationId})`);
            console.log(`         Status: ${presData?.status}`);
            console.log(`         Slides: ${presData?.slides?.length || 0}`);

            if (presData?.slides?.length > 0) {
                passCount++;
            } else {
                console.warn('  [WARN] Presentation exists but has no slides.');
            }
        }
    }

    if (passCount === sectionsSnap.size) {
        console.log('\n[SUCCESS] All sections have generated presentations with slides.');
        process.exit(0);
    } else {
        console.error(`\n[FAILURE] Only ${passCount}/${sectionsSnap.size} sections are valid.`);
        process.exit(1);
    }
}

runTest().catch(e => {
    console.error('Test Exception:', e);
    process.exit(1);
});
