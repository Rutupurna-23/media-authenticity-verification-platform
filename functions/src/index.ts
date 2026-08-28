/**
 * Media Authenticity Verification Platform - Firebase Cloud Functions Entry Point
 *
 * Exported Cloud Functions (Firebase v2 HTTPS Triggers):
 * 1. uploadMedia (Institutional media upload, binary Cloud Storage stream, Firestore manifest)
 * 2. signMedia (Cryptographic digital signature generation using backend KMS abstraction)
 * 3. verifyMedia (Zero-auth public media authenticity verification & Firestore audit logging)
 * 4. revokeCredential (SYSTEM_ADMIN credential revocation & keystore invalidation)
 */

import { onRequest, onCall, HttpsError } from 'firebase-functions/v2/https';
import { AuthService, AuthContext } from './auth/authService.js';
import { firestore, adminStorage, adminAuth } from './auth/firebaseAdmin.js';
import { MediaService, UploadMediaParams, SignMediaParams, SignMediaResult } from './media/mediaService.js';
import { VerificationService, VerifyMediaParams, VerifyMediaResult } from './verification/verificationService.js';
import { CredentialService, RevokeCredentialParams } from './credentials/credentialService.js';
import { kmsProvider, IKMSProvider } from './media/kmsProvider.js';
import { deepfakeDetector, blockchainProvider } from './verification/modularProviders.js';
import {
  UserRole,
  CredentialStatus,
  MediaType,
  MediaRecord,
  Credential,
  Institution,
  VerificationLog,
  VerificationVerdict,
} from './types.js';

export {
  AuthService,
  MediaService,
  VerificationService,
  CredentialService,
  kmsProvider,
  deepfakeDetector,
  blockchainProvider,
};

export type {
  UserRole,
  CredentialStatus,
  MediaType,
  MediaRecord,
  Credential,
  Institution,
  VerificationLog,
  VerificationVerdict,
  AuthContext,
  UploadMediaParams,
  SignMediaParams,
  SignMediaResult,
  VerifyMediaParams,
  VerifyMediaResult,
  RevokeCredentialParams,
  IKMSProvider,
};

// =========================================================================
// FIRESTORE & STORAGE DRIVER HELPERS FOR CLOUD FUNCTIONS
// =========================================================================

async function defaultStorageDriver(storagePath: string, buffer: Buffer, mime?: string): Promise<string> {
  const bucket = adminStorage.bucket();
  const file = bucket.file(storagePath);
  await file.save(buffer, {
    metadata: {
      contentType: mime || 'application/octet-stream',
    },
    resumable: false,
  });
  return storagePath;
}

const defaultDbDriver = {
  async findMediaRecordByHash(hash: string): Promise<MediaRecord | null> {
    const normalized = hash.trim().toLowerCase();
    const snap = await firestore.collection('mediaRecords').where('mediaHash', '==', normalized).limit(1).get();
    if (snap.empty) {
      const fallbackSnap = await firestore.collection('mediaRecords').where('mediaHash', '==', hash.trim()).limit(1).get();
      if (fallbackSnap.empty) return null;
      const doc = fallbackSnap.docs[0];
      return { id: doc.id, ...(doc.data() as Omit<MediaRecord, 'id'>) };
    }
    const doc = snap.docs[0];
    return { id: doc.id, ...(doc.data() as Omit<MediaRecord, 'id'>) };
  },

  async getMediaRecord(idOrHash: string): Promise<MediaRecord | null> {
    const doc = await firestore.collection('mediaRecords').doc(idOrHash).get();
    if (doc.exists) {
      return { id: doc.id, ...(doc.data() as Omit<MediaRecord, 'id'>) };
    }
    return await this.findMediaRecordByHash(idOrHash);
  },

  async createMediaRecord(record: Omit<MediaRecord, 'id'>): Promise<MediaRecord> {
    const id = `rec-${Date.now()}`;
    const docRef = firestore.collection('mediaRecords').doc(id);
    const newRec: MediaRecord = { id, ...record };
    await docRef.set(newRec);
    return newRec;
  },

  async updateMediaRecord(id: string, updates: Partial<MediaRecord>): Promise<MediaRecord> {
    const docRef = firestore.collection('mediaRecords').doc(id);
    const doc = await docRef.get();
    if (!doc.exists) {
      throw new Error(`NOT_FOUND: MediaRecord '${id}' not found.`);
    }
    await docRef.update(updates);
    const updated = await docRef.get();
    return { id: updated.id, ...(updated.data() as Omit<MediaRecord, 'id'>) };
  },

  async getCredentialById(id: string): Promise<Credential | null> {
    const doc = await firestore.collection('credentials').doc(id).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...(doc.data() as Omit<Credential, 'id'>) };
  },

  async updateCredential(id: string, updates: Partial<Credential>): Promise<Credential> {
    const docRef = firestore.collection('credentials').doc(id);
    const doc = await docRef.get();
    if (!doc.exists) {
      throw new Error(`NOT_FOUND: Credential '${id}' not found.`);
    }
    await docRef.update(updates);
    const updated = await docRef.get();
    return { id: updated.id, ...(updated.data() as Omit<Credential, 'id'>) };
  },

  async getInstitutionById(id: string): Promise<Institution | null> {
    const doc = await firestore.collection('institutions').doc(id).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...(doc.data() as Omit<Institution, 'id'>) };
  },

  async createVerificationLog(log: Omit<VerificationLog, 'id'>): Promise<VerificationLog> {
    const id = `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const docRef = firestore.collection('verificationLogs').doc(id);
    const newLog: VerificationLog = { id, ...log };
    await docRef.set(newLog);
    return newLog;
  },
};

async function parseAuthFromRequest(req: any): Promise<AuthContext | undefined> {
  const authHeader = req.headers?.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const idToken = authHeader.substring(7).trim();
    try {
      const decoded = await adminAuth.verifyIdToken(idToken);
      return {
        uid: decoded.uid,
        email: decoded.email || '',
        role: (decoded.role as UserRole) || 'INSTITUTIONAL_ISSUER',
        institutionId: decoded.institutionId,
      };
    } catch (_err) {
      return undefined;
    }
  }

  // Fallback for emulator / testing simulation
  const role = req.headers?.['x-user-role'] as UserRole;
  if (role) {
    return {
      uid: (req.headers?.['x-user-uid'] as string) || 'user-simulated',
      email: (req.headers?.['x-user-email'] as string) || 'simulated@issuer.org',
      role: role,
      institutionId: req.headers?.['x-institution-id'] as string,
    };
  }

  return undefined;
}

// =========================================================================
// HANDLER EXPORTS (Used by server.ts and internal test suites)
// =========================================================================

export async function uploadMediaHandler(
  auth: AuthContext | undefined,
  params: UploadMediaParams,
  storageDriver: (path: string, buffer: Buffer, mime?: string) => Promise<string> = defaultStorageDriver,
  dbDriver: {
    createMediaRecord: (r: Omit<MediaRecord, 'id'>) => Promise<MediaRecord>;
  } = defaultDbDriver
) {
  return await MediaService.uploadMedia(auth, params, storageDriver, dbDriver.createMediaRecord);
}

export async function signMediaHandler(
  auth: AuthContext | undefined,
  params: SignMediaParams,
  dbDriver: {
    getCredentialById: (id: string) => Promise<Credential | null>;
    getMediaRecord: (id: string) => Promise<MediaRecord | null>;
    updateMediaRecord: (id: string, updates: Partial<MediaRecord>) => Promise<MediaRecord>;
  } = defaultDbDriver
) {
  return await MediaService.signMedia(
    auth,
    params,
    dbDriver.getCredentialById,
    dbDriver.getMediaRecord,
    dbDriver.updateMediaRecord
  );
}

export async function verifyMediaHandler(
  params: VerifyMediaParams,
  dbDriver: {
    findMediaRecordByHash: (hash: string) => Promise<MediaRecord | null>;
    getCredentialById: (id: string) => Promise<Credential | null>;
    getInstitutionById: (id: string) => Promise<Institution | null>;
    getStorageFile?: (storagePath: string) => Promise<{ buffer: Buffer; mimeType: string; originalName: string }>;
    createVerificationLog: (log: Omit<VerificationLog, 'id'>) => Promise<VerificationLog>;
  } = defaultDbDriver
) {
  return await VerificationService.verifyMedia(
    params,
    dbDriver.findMediaRecordByHash,
    dbDriver.getCredentialById,
    dbDriver.getInstitutionById,
    dbDriver.createVerificationLog,
    dbDriver.getStorageFile
  );
}

export async function revokeCredentialHandler(
  auth: AuthContext | undefined,
  params: RevokeCredentialParams,
  dbDriver: {
    getCredentialById: (id: string) => Promise<Credential | null>;
    updateCredential: (id: string, updates: Partial<Credential>) => Promise<Credential>;
  } = defaultDbDriver
) {
  return await CredentialService.revokeCredential(
    auth,
    params,
    dbDriver.getCredentialById,
    dbDriver.updateCredential
  );
}

// =========================================================================
// LIVE FIREBASE V2 CLOUD FUNCTION TRIGGERS
// =========================================================================

/**
 * 1. uploadMediaFunction (HTTPS Trigger)
 */
export const uploadMedia = onRequest({ cors: true, maxInstances: 10 }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'METHOD_NOT_ALLOWED: Use POST for media upload.' });
    return;
  }

  try {
    const auth = await parseAuthFromRequest(req);
    const { institutionId, credentialId, mediaType, fileName, fileBase64, mimeType, title } = req.body;

    if (!fileBase64 || !fileName) {
      res.status(400).json({ error: 'INVALID_ARGUMENT: fileName and fileBase64 are required.' });
      return;
    }

    const fileBuffer = Buffer.from(fileBase64, 'base64');
    const record = await uploadMediaHandler(
      auth,
      {
        institutionId: auth?.role === 'SYSTEM_ADMIN' ? (institutionId || auth.institutionId) : (auth?.institutionId || institutionId),
        credentialId,
        mediaType: mediaType || 'NOTICE',
        fileName,
        fileBuffer,
        mimeType,
        title,
      },
      defaultStorageDriver,
      defaultDbDriver
    );

    res.status(201).json(record);
  } catch (err: any) {
    const isAuth = err.message?.includes('UNAUTHENTICATED');
    const isPerm = err.message?.includes('PERMISSION_DENIED');
    res.status(isAuth ? 401 : isPerm ? 403 : 400).json({ error: err.message });
  }
});

/**
 * 2. signMediaFunction (Callable Trigger)
 */
export const signMedia = onCall({ cors: true }, async (request) => {
  const auth: AuthContext = {
    uid: request.auth?.uid || 'anonymous',
    email: request.auth?.token?.email || '',
    role: (request.auth?.token?.role as UserRole) || 'INSTITUTIONAL_ISSUER',
    institutionId: request.auth?.token?.institutionId as string,
  };

  const { mediaRecordId, mediaHash, credentialId, institutionId } = request.data;
  if (!credentialId || (!mediaRecordId && !mediaHash)) {
    throw new HttpsError('invalid-argument', 'credentialId and (mediaRecordId or mediaHash) are required.');
  }

  try {
    return await signMediaHandler(
      auth,
      {
        mediaRecordId,
        mediaHash,
        credentialId,
        institutionId: auth.role === 'SYSTEM_ADMIN' ? (institutionId || auth.institutionId) : (auth.institutionId || institutionId),
      },
      defaultDbDriver
    );
  } catch (err: any) {
    const isPerm = err.message?.includes('PERMISSION_DENIED');
    const isPrecond = err.message?.includes('FAILED_PRECONDITION');
    throw new HttpsError(isPerm ? 'permission-denied' : isPrecond ? 'failed-precondition' : 'internal', err.message);
  }
});

/**
 * 3. verifyMediaFunction (HTTPS Trigger - Public Zero-Auth)
 */
export const verifyMedia = onRequest({ cors: true }, async (req, res) => {
  try {
    const mediaHash = (req.query.mediaHash as string) || req.body?.mediaHash;
    if (!mediaHash) {
      res.status(400).json({ error: 'INVALID_ARGUMENT: mediaHash is required for verification.' });
      return;
    }

    const result = await verifyMediaHandler({ mediaHash }, defaultDbDriver);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * 4. revokeCredentialFunction (Callable Trigger - SYSTEM_ADMIN only)
 */
export const revokeCredential = onCall({ cors: true }, async (request) => {
  const auth: AuthContext = {
    uid: request.auth?.uid || 'anonymous',
    email: request.auth?.token?.email || '',
    role: (request.auth?.token?.role as UserRole) || 'PUBLIC_RECIPIENT',
  };

  const { credentialId, revocationReason } = request.data;
  if (!credentialId || !revocationReason) {
    throw new HttpsError('invalid-argument', 'credentialId and revocationReason are required.');
  }

  try {
    return await revokeCredentialHandler(auth, { credentialId, revocationReason }, defaultDbDriver);
  } catch (err: any) {
    const isPerm = err.message?.includes('PERMISSION_DENIED');
    const isPrecond = err.message?.includes('FAILED_PRECONDITION');
    throw new HttpsError(isPerm ? 'permission-denied' : isPrecond ? 'failed-precondition' : 'internal', err.message);
  }
});
