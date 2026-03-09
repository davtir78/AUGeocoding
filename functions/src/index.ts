/**
 * Entry point expected by Firebase deploy.
 * Re-export functions from individual modules.
 */

import * as admin from 'firebase-admin';

// Initialize Firebase Admin SDK once
if (admin.apps.length === 0) {
    admin.initializeApp();
}

export { openrouterProxy } from './openrouterProxy';
export { generatePresentationHttp } from './generatePresentation';
export { fetchPresentationResponse } from './fetchPresentationResponse';
export { processPresentation } from './processPresentation';

// Sprint 2 – Course Generator / Study Aids pipeline
export { generateStudyAidJobHttp } from './generateStudyAidJobHttp';
export { fetchCourseJobResponse } from './fetchCourseJobResponse';
export { processCourseJob } from './processCourseJob';
export { syncCourseStatus } from './course/courseStatusTrigger';

// Sprint 3 – Quiz Generation processor
// Sprint 3 – Quiz Generation processor
export { processGenerationJobs } from './processGenerationJobs';
export { fetchRevisionQuizJobResponse } from './fetchRevisionQuizJobResponse';
export { dispatchPresentationJob } from './dispatchPresentationJob';

// Sprint 3.2 - Presentation V2
export { processPresentationV2 } from './presentation/v2';

// Sprint 3.2 - Infographics
// Sprint 3.2 - Infographics
export { processInfographicJob } from './infographic';

// Voice Mode - Tutor's Quill
export { generatePortalPass } from './generatePortalPass';

// Sprint 3.5 - Orator's Podium (Audio)
export { generateAudio } from './audio/generateAudio';

// Sprint 6 - Monetization
// export { createCheckoutSession, handleStripeWebhook } from './stripe';

// Sprint 3.13 - Knowledge/Vault
export { processArtifactJob } from './knowledge/processArtifactJob';
export { submitArtifactJob } from './knowledge/submitArtifactJob';
export { forgeQuest } from './knowledge/forgeQuest';

// Sprint 3.14 - The Studio
export { regenerateImage } from './studio/regenerateImage';

// Sprint 3.14 - Mastery & Experience
export { handleQuizResult } from './course/handleQuizResult';
