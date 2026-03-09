import * as admin from 'firebase-admin';

// Initialize Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp({
        projectId: 'scholars-alley-dev',
        // credential: admin.credential.applicationDefault() // Assumes logged in via gcloud or emulator
    });
}
const db = admin.firestore();

async function runTest() {
    console.log('[Test] Starting Course Generation Integration Test...');

    const userId = 'test-user-' + Date.now();
    const jobId = 'test-job-' + Date.now();
    const jobRef = db.collection('generationJobs').doc(jobId);

    // 1. Create Job
    console.log(`[Test] Creating Job ${jobId}...`);
    await jobRef.set({
        userId,
        type: 'course',
        status: 'queued',
        input: {
            topic: 'Photosynthesis',
            subject: 'Science',
            gradeLevel: 'Year 7',
            preferredModels: ['google/gemini-2.5-flash-exp:free'], // Use free/fast model for test
            presentationModels: ['google/gemini-2.5-flash-exp:free'],
            quizModels: ['google/gemini-2.5-flash-exp:free']
        },
        createdAt: new Date(),
        updatedAt: new Date()
    });

    // 2. Poll for Status Change
    let status = 'queued';
    let attempts = 0;
    while (status !== 'completed' && status !== 'failed' && attempts < 60) {
        await new Promise(r => setTimeout(r, 2000)); // Wait 2s
        const snap = await jobRef.get();
        const data = snap.data();
        status = data?.status || 'unknown';
        console.log(`[Test] Job Status: ${status}`);

        if (status === 'fetched') {
            console.log('[Test] Job Fetched (Outline Generated). Waiting for Processing...');
        }

        attempts++;
    }

    if (status !== 'completed') {
        console.error('[Test] Job did not complete in time or failed.');
        process.exit(1);
    }

    // 3. Verify Course Created
    const jobData = (await jobRef.get()).data();
    const courseId = jobData?.courseId;
    if (!courseId) {
        console.error('[Test] No Course ID found in completed job.');
        process.exit(1);
    }
    console.log(`[Test] Course Created: ${courseId}`);

    // 4. Verify Sections & Presentations
    const sectionsSnap = await db.collection('courses').doc(courseId).collection('sections').get();
    console.log(`[Test] Sections Created: ${sectionsSnap.size}`);

    if (sectionsSnap.empty) {
        console.error('[Test] No sections created.');
        process.exit(1);
    }

    let presentationsFound = 0;
    let quizJobsFound = 0;

    for (const section of sectionsSnap.docs) {
        const data = section.data();
        console.log(`   - Section: ${data.title}`);

        if (data.presentationId) {
            console.log(`     > Linked Presentation: ${data.presentationId}`);
            const presSnap = await db.collection('presentations').doc(data.presentationId).get();
            if (presSnap.exists) {
                presentationsFound++;
                console.log(`       [OK] Presentation Doc Exists (Status: ${presSnap.data()?.status})`);
            } else {
                console.error(`       [FAIL] Presentation Doc Missing!`);
            }
        } else {
            console.error(`     [FAIL] No Presentation ID linked!`);
        }

        if (data.quizJobId) {
            console.log(`     > Linked Quiz Job: ${data.quizJobId}`);
            quizJobsFound++;
        }
    }

    if (presentationsFound === sectionsSnap.size) {
        console.log('[Test] SUCCESS: All sections have presentations.');
        process.exit(0);
    } else {
        console.error('[Test] FAILURE: Not all sections have presentations.');
        process.exit(1);
    }
}

runTest().catch(e => {
    console.error(e);
    process.exit(1);
});
