import { getApps, initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const projectId =
  process.env.FIREBASE_PROJECT_ID ||
  process.env.GCLOUD_PROJECT ||
  'media-authenticity-platform';

const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;
const privateKey = rawPrivateKey ? rawPrivateKey.replace(/\\n/g, '\n') : undefined;

const app =
  getApps().length > 0
    ? getApps()[0]
    : (() => {
        if (clientEmail && privateKey) {
          try {
            return initializeApp({
              credential: cert({
                projectId,
                clientEmail,
                privateKey,
              }),
              projectId,
              storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com`,
            });
          } catch (err) {
            console.warn('Failed cert initialization, falling back to applicationDefault:', err);
          }
        }

        try {
          return initializeApp({
            credential: applicationDefault(),
            projectId,
            storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com`,
          });
        } catch (_err) {
          return initializeApp({
            projectId,
            storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com`,
          });
        }
      })();

export const firestore = getFirestore(app);
export const storage = getStorage(app);

console.log(`Firebase Admin initialized for project: ${projectId}`);
