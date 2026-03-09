import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const auth = getAuth();
const db = getFirestore();

async function backfillProfiles() {
  console.log('Starting profile backfill...');
  const listUsersResult = await auth.listUsers();
  const users = listUsersResult.users;
  let processedCount = 0;
  let skippedCount = 0;

  for (const userRecord of users) {
    const uid = userRecord.uid;
    const profileRef = db.collection('userProfiles').doc(uid);
    const profileSnap = await profileRef.get();
    
    if (!profileSnap.exists) {
      const { firstName, lastName } = parseDisplayName(userRecord.displayName);
      await profileRef.set({
        uid,
        firstName,
        lastName,
        photoURL: userRecord.photoURL || null,
        age: null,
        avatarChoice: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        migratedAt: new Date().toISOString(),
      });
      console.log(`Backfilled profile for ${uid}: ${firstName} ${lastName}`);
      processedCount++;
    } else {
      console.log(`Skipped ${uid}: profile already exists`);
      skippedCount++;
    }
  }

  console.log(`Backfill complete. Processed: ${processedCount}, Skipped: ${skippedCount}`);
}

function parseDisplayName(displayName?: string): { firstName: string; lastName: string } {
  if (!displayName) return { firstName: '', lastName: '' };
  const parts = displayName.trim().split(' ');
  const firstName = parts[0] || '';
  const lastName = parts.slice(1).join(' ') || '';
  return { firstName, lastName };
}

backfillProfiles().catch(console.error);
