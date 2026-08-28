import { Institution, Credential, MediaRecord, VerificationLog } from '../types.js';
import {
  institutionRepository,
  credentialRepository,
  mediaRepository,
  verificationLogRepository,
  seedInitialFirestoreData,
} from './firestore/index.js';
import { mediaStorageService, StorageDownloadResult } from './storage/mediaStorageService.js';
import { AuthContext } from '../../functions/src/auth/authService.js';

/**
 * Firestore-backed Database & Cloud Storage Service
 * Fully integrates Firestore repositories and Firebase Cloud Storage buckets.
 */
export class FirestoreDatabaseService {
  private static instance: FirestoreDatabaseService;
  private initPromise: Promise<void> | null = null;

  private constructor() {}

  public static getInstance(): FirestoreDatabaseService {
    if (!FirestoreDatabaseService.instance) {
      FirestoreDatabaseService.instance = new FirestoreDatabaseService();
    }
    return FirestoreDatabaseService.instance;
  }

  public async ensureInitialized(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        try {
          await seedInitialFirestoreData();
        } catch (err) {
          this.initPromise = null;
          throw err;
        }
      })();
    }
    await this.initPromise;
  }

  // 1. Institution operations (Firestore collection: institutions)
  public async getInstitution(id: string): Promise<Institution | null> {
    await this.ensureInitialized();
    return await institutionRepository.get(id);
  }

  public async listInstitutions(callerAuth?: AuthContext): Promise<Institution[]> {
    await this.ensureInitialized();
    return await institutionRepository.list(callerAuth);
  }

  public async createInstitution(
    inst: Omit<Institution, 'id'> & { id?: string },
    callerAuth?: AuthContext
  ): Promise<Institution> {
    await this.ensureInitialized();
    const auth = callerAuth || {
      uid: 'system-admin',
      email: 'admin@verification-gateway.gov',
      role: 'SYSTEM_ADMIN',
    };
    return await institutionRepository.create(auth, inst);
  }

  public async updateInstitution(
    id: string,
    updates: Partial<Institution>,
    callerAuth?: AuthContext
  ): Promise<Institution> {
    await this.ensureInitialized();
    const auth = callerAuth || {
      uid: 'system-admin',
      email: 'admin@verification-gateway.gov',
      role: 'SYSTEM_ADMIN',
    };
    return await institutionRepository.update(auth, id, updates);
  }

  // 2. Credential operations (Firestore collection: credentials)
  public async getCredential(id: string): Promise<Credential | null> {
    await this.ensureInitialized();
    return await credentialRepository.get(id);
  }

  public async listCredentials(institutionId?: string): Promise<Credential[]> {
    await this.ensureInitialized();
    return await credentialRepository.list(institutionId);
  }

  public async createCredential(cred: Omit<Credential, 'id'> & { id?: string }): Promise<Credential> {
    await this.ensureInitialized();
    return await credentialRepository.create(cred);
  }

  public async updateCredential(id: string, updates: Partial<Credential>): Promise<Credential> {
    await this.ensureInitialized();
    return await credentialRepository.update(id, updates);
  }

  public async revokeCredential(
    id: string,
    revocationReason: string,
    callerAuth?: AuthContext
  ): Promise<Credential> {
    await this.ensureInitialized();
    const auth = callerAuth || {
      uid: 'system-admin',
      email: 'admin@verification-gateway.gov',
      role: 'SYSTEM_ADMIN',
    };
    return await credentialRepository.revoke(auth, id, revocationReason);
  }

  // 3. Media Record operations (Firestore collection: mediaRecords)
  public async getMediaRecord(id: string): Promise<MediaRecord | null> {
    await this.ensureInitialized();
    return await mediaRepository.get(id);
  }

  public async findMediaRecordByHash(hash: string): Promise<MediaRecord | null> {
    await this.ensureInitialized();
    return await mediaRepository.findByHash(hash);
  }

  public async listMediaRecords(institutionId?: string): Promise<MediaRecord[]> {
    await this.ensureInitialized();
    return await mediaRepository.list(institutionId);
  }

  public async createMediaRecord(record: Omit<MediaRecord, 'id'> & { id?: string }): Promise<MediaRecord> {
    await this.ensureInitialized();
    return await mediaRepository.create(record);
  }

  public async updateMediaRecord(id: string, updates: Partial<MediaRecord>): Promise<MediaRecord> {
    await this.ensureInitialized();
    return await mediaRepository.update(id, updates);
  }

  // 4. Verification Log operations (Firestore collection: verificationLogs)
  public async createVerificationLog(log: Omit<VerificationLog, 'id'> & { id?: string }): Promise<VerificationLog> {
    await this.ensureInitialized();
    return await verificationLogRepository.create(log);
  }

  public async listVerificationLogs(limitCount = 100, issuerId?: string): Promise<VerificationLog[]> {
    await this.ensureInitialized();
    return await verificationLogRepository.list(limitCount, issuerId);
  }

  // 5. Binary Media Cloud Storage operations (Firebase / Google Cloud Storage bucket)
  public async saveStorageFile(
    storagePath: string,
    buffer: Buffer,
    mimeType?: string,
    _originalName?: string,
    callerAuth?: AuthContext
  ): Promise<string> {
    await this.ensureInitialized();
    const match = storagePath.match(/^media\/institutions\/([^/]+)\/(.+)$/);
    const institutionId = match ? match[1] : 'general';
    const fileName = match ? match[2] : 'file';

    const result = await mediaStorageService.upload({
      institutionId,
      fileName,
      fileBuffer: buffer,
      mimeType,
      callerAuth,
    });
    return result.storagePath;
  }

  public async getStorageFile(storagePath: string, callerAuth?: AuthContext): Promise<StorageDownloadResult> {
    await this.ensureInitialized();
    return await mediaStorageService.download(storagePath, callerAuth);
  }

  public async deleteStorageFile(storagePath: string, callerAuth?: AuthContext): Promise<void> {
    await this.ensureInitialized();
    await mediaStorageService.delete(storagePath, callerAuth);
  }

  public async storageFileExists(storagePath: string): Promise<boolean> {
    await this.ensureInitialized();
    return await mediaStorageService.exists(storagePath);
  }
}

export const db = FirestoreDatabaseService.getInstance();
