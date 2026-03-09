import * as functions from "firebase-functions";
import * as logger from "firebase-functions/logger";

// 1st Gen callable function for comparison testing
export const testAuthV1 = functions.https.onCall((data, context) => {
  logger.info("V1 Test function invoked!");
  logger.info("V1 Auth data:", JSON.stringify(context.auth));
  logger.info("V1 Request data:", JSON.stringify(data));
  
  const uid = context.auth?.uid;
  logger.info("V1 UID from request:", uid);
  
  if (!uid) {
    logger.warn("V1 No UID found in request.");
    return { status: "error", message: "Not authenticated." };
  }
  
  logger.info(`V1 Request received from UID: ${uid}`);
  return { 
    status: "success", 
    message: `Hello from V1, ${uid}`, 
    timestamp: new Date().toISOString(),
    version: "v1"
  };
});
