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
if (!admin.apps.length) {
    admin.initializeApp({
        projectId: 'scholars-alley-dev'
    });
}
const db = admin.firestore();
async function listUsers() {
    const snapshot = await db.collection('generationJobs').get();
    const stats = {};
    snapshot.forEach(doc => {
        const data = doc.data();
        const uid = data.userId || 'unknown';
        if (!stats[uid]) {
            stats[uid] = {
                total: 0,
                queued: 0,
                processing: 0,
                failed: 0,
                artifact: 0,
                other: 0
            };
        }
        stats[uid].total++;
        if (data.status === 'queued')
            stats[uid].queued++;
        if (data.status === 'processing')
            stats[uid].processing++;
        if (data.status === 'failed')
            stats[uid].failed++;
        if (data.type === 'artifact')
            stats[uid].artifact++;
        else
            stats[uid].other++;
    });
    console.log("User Stats in generationJobs:");
    console.table(stats);
}
listUsers().catch(console.error);
