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
process.env.GCLOUD_PROJECT = 'scholars-alley-dev';
if (!admin.apps.length) {
    admin.initializeApp({
        projectId: 'scholars-alley-dev',
        credential: admin.credential.applicationDefault()
    });
}
const db = admin.firestore();
async function inspect() {
    // Try to find a Math standard
    console.log("Fetching a sample Mathematics standard...");
    const snapshot = await db.collection('curriculum_standards')
        .where('educational_context.subject', '==', 'Mathematics')
        .limit(1)
        .get();
    if (!snapshot.empty) {
        const data = snapshot.docs[0].data();
        console.log(JSON.stringify(data, null, 2));
    }
    else {
        console.log("No Mathematics standards found. Trying any standard...");
        const anySnap = await db.collection('curriculum_standards').limit(1).get();
        if (!anySnap.empty) {
            console.log(JSON.stringify(anySnap.docs[0].data(), null, 2));
        }
        else {
            console.log("Database appears empty?");
        }
    }
}
inspect();
