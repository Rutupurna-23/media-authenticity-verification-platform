import { getApps, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const projectId = 'media-authenticity-platform';

const app =
  getApps().length > 0
    ? getApps()[0]
    : (() => {
        try {
          return initializeApp({
            credential: applicationDefault(),
            projectId,
            storageBucket: `${projectId}.appspot.com`,
          });
        } catch (_err) {
          return initializeApp({
            projectId,
            storageBucket: `${projectId}.appspot.com`,
          });
        }
      })();

export const firestore = getFirestore(app);
export const storage = getStorage(app);

console.log(`Firebase Admin initialized for project: ${projectId}`);
