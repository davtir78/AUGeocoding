"use strict";
/**
 * Entry point expected by Firebase deploy.
 * Re-export functions from individual modules.
 */
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
exports.handleQuizResult = exports.regenerateImage = exports.forgeQuest = exports.submitArtifactJob = exports.processArtifactJob = exports.generateAudio = exports.generatePortalPass = exports.processInfographicJob = exports.processPresentationV2 = exports.dispatchPresentationJob = exports.fetchRevisionQuizJobResponse = exports.processGenerationJobs = exports.syncCourseStatus = exports.processCourseJob = exports.fetchCourseJobResponse = exports.generateStudyAidJobHttp = exports.processPresentation = exports.fetchPresentationResponse = exports.generatePresentationHttp = exports.openrouterProxy = void 0;
const admin = __importStar(require("firebase-admin"));
// Initialize Firebase Admin SDK once
if (admin.apps.length === 0) {
    admin.initializeApp();
}
var openrouterProxy_1 = require("./openrouterProxy");
Object.defineProperty(exports, "openrouterProxy", { enumerable: true, get: function () { return openrouterProxy_1.openrouterProxy; } });
var generatePresentation_1 = require("./generatePresentation");
Object.defineProperty(exports, "generatePresentationHttp", { enumerable: true, get: function () { return generatePresentation_1.generatePresentationHttp; } });
var fetchPresentationResponse_1 = require("./fetchPresentationResponse");
Object.defineProperty(exports, "fetchPresentationResponse", { enumerable: true, get: function () { return fetchPresentationResponse_1.fetchPresentationResponse; } });
var processPresentation_1 = require("./processPresentation");
Object.defineProperty(exports, "processPresentation", { enumerable: true, get: function () { return processPresentation_1.processPresentation; } });
// Sprint 2 – Course Generator / Study Aids pipeline
var generateStudyAidJobHttp_1 = require("./generateStudyAidJobHttp");
Object.defineProperty(exports, "generateStudyAidJobHttp", { enumerable: true, get: function () { return generateStudyAidJobHttp_1.generateStudyAidJobHttp; } });
var fetchCourseJobResponse_1 = require("./fetchCourseJobResponse");
Object.defineProperty(exports, "fetchCourseJobResponse", { enumerable: true, get: function () { return fetchCourseJobResponse_1.fetchCourseJobResponse; } });
var processCourseJob_1 = require("./processCourseJob");
Object.defineProperty(exports, "processCourseJob", { enumerable: true, get: function () { return processCourseJob_1.processCourseJob; } });
var courseStatusTrigger_1 = require("./course/courseStatusTrigger");
Object.defineProperty(exports, "syncCourseStatus", { enumerable: true, get: function () { return courseStatusTrigger_1.syncCourseStatus; } });
// Sprint 3 – Quiz Generation processor
// Sprint 3 – Quiz Generation processor
var processGenerationJobs_1 = require("./processGenerationJobs");
Object.defineProperty(exports, "processGenerationJobs", { enumerable: true, get: function () { return processGenerationJobs_1.processGenerationJobs; } });
var fetchRevisionQuizJobResponse_1 = require("./fetchRevisionQuizJobResponse");
Object.defineProperty(exports, "fetchRevisionQuizJobResponse", { enumerable: true, get: function () { return fetchRevisionQuizJobResponse_1.fetchRevisionQuizJobResponse; } });
var dispatchPresentationJob_1 = require("./dispatchPresentationJob");
Object.defineProperty(exports, "dispatchPresentationJob", { enumerable: true, get: function () { return dispatchPresentationJob_1.dispatchPresentationJob; } });
// Sprint 3.2 - Presentation V2
var v2_1 = require("./presentation/v2");
Object.defineProperty(exports, "processPresentationV2", { enumerable: true, get: function () { return v2_1.processPresentationV2; } });
// Sprint 3.2 - Infographics
// Sprint 3.2 - Infographics
var infographic_1 = require("./infographic");
Object.defineProperty(exports, "processInfographicJob", { enumerable: true, get: function () { return infographic_1.processInfographicJob; } });
// Voice Mode - Tutor's Quill
var generatePortalPass_1 = require("./generatePortalPass");
Object.defineProperty(exports, "generatePortalPass", { enumerable: true, get: function () { return generatePortalPass_1.generatePortalPass; } });
// Sprint 3.5 - Orator's Podium (Audio)
var generateAudio_1 = require("./audio/generateAudio");
Object.defineProperty(exports, "generateAudio", { enumerable: true, get: function () { return generateAudio_1.generateAudio; } });
// Sprint 6 - Monetization
// export { createCheckoutSession, handleStripeWebhook } from './stripe';
// Sprint 3.13 - Knowledge/Vault
var processArtifactJob_1 = require("./knowledge/processArtifactJob");
Object.defineProperty(exports, "processArtifactJob", { enumerable: true, get: function () { return processArtifactJob_1.processArtifactJob; } });
var submitArtifactJob_1 = require("./knowledge/submitArtifactJob");
Object.defineProperty(exports, "submitArtifactJob", { enumerable: true, get: function () { return submitArtifactJob_1.submitArtifactJob; } });
var forgeQuest_1 = require("./knowledge/forgeQuest");
Object.defineProperty(exports, "forgeQuest", { enumerable: true, get: function () { return forgeQuest_1.forgeQuest; } });
// Sprint 3.14 - The Studio
var regenerateImage_1 = require("./studio/regenerateImage");
Object.defineProperty(exports, "regenerateImage", { enumerable: true, get: function () { return regenerateImage_1.regenerateImage; } });
// Sprint 3.14 - Mastery & Experience
var handleQuizResult_1 = require("./course/handleQuizResult");
Object.defineProperty(exports, "handleQuizResult", { enumerable: true, get: function () { return handleQuizResult_1.handleQuizResult; } });
