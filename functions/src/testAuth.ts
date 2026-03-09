import { onCall } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";

export const testAuth = onCall(
  {
    region: 'australia-southeast1',
    cors: true,
    enforceAppCheck: false,
  },
  (request) => {
    logger.info("Test function invoked! v3 - MINIMAL");
    
    const uid = request.auth?.uid;
    logger.info("UID from request:", uid || 'null');
    
    if (!uid) {
      logger.warn("No UID found in request.");
      return { status: "error", message: "Not authenticated." };
    }
    
    logger.info(`Request received from UID: ${uid}`);
    return { status: "success", message: `Hello, ${uid}`, timestamp: new Date().toISOString() };
  }
);
