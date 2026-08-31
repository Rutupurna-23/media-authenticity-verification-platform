import { getApps, initializeApp, cert, applicationDefault, App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const isProduction = process.env.NODE_ENV === 'production';

if (!isProduction && !process.env.FIREBASE_CLIENT_EMAIL && !process.env.FIRESTORE_EMULATOR_HOST) {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
  process.env.FIREBASE_STORAGE_EMULATOR_HOST = '127.0.0.1:9199';
}

const firestoreEmulator = process.env.FIRESTORE_EMULATOR_HOST;
const storageEmulator = process.env.FIREBASE_STORAGE_EMULATOR_HOST;

const projectId =
  process.env.FIREBASE_PROJECT_ID ||
  process.env.GCLOUD_PROJECT ||
  'media-authenticity-platform';

let app: App;

if (getApps().length > 0) {
  app = getApps()[0];
} else if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
  app = initializeApp({
    credential: cert({
      projectId,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
    projectId,
    storageBucket:
      process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com`,
  });
} else if (firestoreEmulator || storageEmulator || process.env.NODE_ENV === 'test') {
  app = initializeApp({
    projectId,
    storageBucket:
      process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com`,
  });
} else {
  try {
    app = initializeApp({
      credential: applicationDefault(),
      projectId,
      storageBucket:
        process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com`,
    });
  } catch (_err) {
    app = initializeApp({
      projectId,
      storageBucket:
        process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com`,
    });
  }
}

export const firebaseAdmin = app;
export const adminAuth = getAuth(app);
export const firestore = getFirestore(app);
export const adminStorage = getStorage(app);

try {
  firestore.settings({ ignoreUndefinedProperties: true });
} catch (_e) {
  // Settings already locked if initialized previously.
}
