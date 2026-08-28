import { getApps, initializeApp, cert, applicationDefault, App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const isProduction = process.env.NODE_ENV === 'production';
const firestoreEmulator = process.env.FIRESTORE_EMULATOR_HOST;
const storageEmulator = process.env.FIREBASE_STORAGE_EMULATOR_HOST;

// Never allow production to connect to Firebase emulators.
if (isProduction && (firestoreEmulator || storageEmulator)) {
  throw new Error(
    'CONFIGURATION_ERROR: Firebase emulator endpoints must not be configured in production.'
  );
}

// Automated tests must explicitly use both local Firebase emulators.
if (process.env.NODE_ENV === 'test' && (!firestoreEmulator || !storageEmulator)) {
  throw new Error(
    'CONFIGURATION_ERROR: Test environment requires FIRESTORE_EMULATOR_HOST and FIREBASE_STORAGE_EMULATOR_HOST.'
  );
}

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
} else {
  app = initializeApp({
    credential: applicationDefault(),
    projectId,
    storageBucket:
      process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com`,
  });
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
