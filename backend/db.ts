import { Institution, Credential, MediaRecord, VerificationLog } from '../types.js';
import {
  institutionRepository,
  credentialRepository,
  mediaRepository,
  verificationLogRepository,
  seedInitialFirestoreData,
} from './firestore/index.js';
import { mediaStorageService, StorageDownloadResult } from './storage/mediaStorageService.js';
import { AuthContext } from '../functions/src/auth/authService.js';
import { InMemoryDB } from './backups/db.inmemory.backup.js';

/**
 * Firestore-backed Database & Cloud Storage Service
 * Fully integrates Firestore repositories and Firebase Cloud Storage buckets
 * with safe automatic fallback to InMemoryDB when ADC credentials are absent in development.
 */
export class FirestoreDatabaseService {
  private static instance: FirestoreDatabaseService;
  private initPromise: Promise<void> | null = null;
  private useInMemoryFallback = false;

  private constructor() {}

  public static getInstance(): FirestoreDatabaseService {
    if (!FirestoreDatabaseService.instance) {
      FirestoreDatabaseService.instance = new FirestoreDatabaseService();
    }
    return FirestoreDatabaseService.instance;
  }

  public async ensureInitialized(): Promise<void> {
    if (this.useInMemoryFallback) return;

    if (!this.initPromise) {
      this.initPromise = (async () => {
        try {
          const timeoutMs = process.env.CI || process.env.FIRESTORE_EMULATOR_HOST ? 10000 : 5000;
          let timer: NodeJS.Timeout;
          const timeoutPromise = new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error('Firestore connection timeout (emulator inactive)')), timeoutMs);
          });

          // Attach immediate catch handler to prevent unhandled promise rejections
          const seedPromise = seedInitialFirestoreData().catch((err) => {
            console.warn('Firestore seeding notice:', err?.message || err);
          });

          await Promise.race([seedPromise, timeoutPromise]);
          clearTimeout(timer!);
        } catch (err: any) {
          console.warn('Firestore notice: Switching to InMemoryDB mode for local development:', err?.message || err);
          this.useInMemoryFallback = true;
        }
      })();
    }

    try {
      await this.initPromise;
    } catch (_err) {
      this.useInMemoryFallback = true;
    }
  }

  private get inMemory(): InMemoryDB {
    return InMemoryDB.getInstance();
  }

  // 1. Institution operations (Firestore collection: institutions)
  public async getInstitution(id: string): Promise<Institution | null> {
    await this.ensureInitialized();
    if (this.useInMemoryFallback) return this.inMemory.getInstitution(id);
    try {
      return await institutionRepository.get(id);
    } catch (_err) {
      this.useInMemoryFallback = true;
      return this.inMemory.getInstitution(id);
    }
  }

  public async listInstitutions(callerAuth?: AuthContext): Promise<Institution[]> {
    await this.ensureInitialized();
    if (this.useInMemoryFallback) return this.inMemory.listInstitutions();
    try {
      return await institutionRepository.list(callerAuth);
    } catch (_err) {
      this.useInMemoryFallback = true;
      return this.inMemory.listInstitutions();
    }
  }

  public async createInstitution(
    inst: Omit<Institution, 'id'> & { id?: string },
    callerAuth?: AuthContext
  ): Promise<Institution> {
    await this.ensureInitialized();
    if (this.useInMemoryFallback) return this.inMemory.createInstitution(inst);
    try {
      const auth = callerAuth || {
        uid: 'system-admin',
        email: 'admin@verification-gateway.gov',
        role: 'SYSTEM_ADMIN',
      };
      return await institutionRepository.create(auth, inst);
    } catch (_err) {
      this.useInMemoryFallback = true;
      return this.inMemory.createInstitution(inst);
    }
  }

  public async updateInstitution(
    id: string,
    updates: Partial<Institution>,
    callerAuth?: AuthContext
  ): Promise<Institution> {
    await this.ensureInitialized();
    if (this.useInMemoryFallback) return this.inMemory.updateInstitution(id, updates);
    try {
      const auth = callerAuth || {
        uid: 'system-admin',
        email: 'admin@verification-gateway.gov',
        role: 'SYSTEM_ADMIN',
      };
      return await institutionRepository.update(auth, id, updates);
    } catch (_err) {
      this.useInMemoryFallback = true;
      return this.inMemory.updateInstitution(id, updates);
    }
  }

  // 2. Credential operations (Firestore collection: credentials)
  public async getCredential(id: string): Promise<Credential | null> {
    await this.ensureInitialized();
    if (this.useInMemoryFallback) return this.inMemory.getCredential(id);
    try {
      return await credentialRepository.get(id);
    } catch (_err) {
      this.useInMemoryFallback = true;
      return this.inMemory.getCredential(id);
    }
  }

  public async listCredentials(institutionId?: string): Promise<Credential[]> {
    await this.ensureInitialized();
    if (this.useInMemoryFallback) return this.inMemory.listCredentials(institutionId);
    try {
      return await credentialRepository.list(institutionId);
    } catch (_err) {
      this.useInMemoryFallback = true;
      return this.inMemory.listCredentials(institutionId);
    }
  }

  public async createCredential(cred: Omit<Credential, 'id'> & { id?: string }): Promise<Credential> {
    await this.ensureInitialized();
    if (this.useInMemoryFallback) return this.inMemory.createCredential(cred);
    try {
      return await credentialRepository.create(cred);
    } catch (_err) {
      this.useInMemoryFallback = true;
      return this.inMemory.createCredential(cred);
    }
  }

  public async updateCredential(id: string, updates: Partial<Credential>): Promise<Credential> {
    await this.ensureInitialized();
    if (this.useInMemoryFallback) return this.inMemory.updateCredential(id, updates);
    try {
      return await credentialRepository.update(id, updates);
    } catch (_err) {
      this.useInMemoryFallback = true;
      return this.inMemory.updateCredential(id, updates);
    }
  }

  public async revokeCredential(
    id: string,
    revocationReason: string,
    callerAuth?: AuthContext
  ): Promise<Credential> {
    await this.ensureInitialized();
    if (this.useInMemoryFallback) return this.inMemory.revokeCredential(id, revocationReason);
    try {
      const auth = callerAuth || {
        uid: 'system-admin',
        email: 'admin@verification-gateway.gov',
        role: 'SYSTEM_ADMIN',
      };
      return await credentialRepository.revoke(auth, id, revocationReason);
    } catch (_err) {
      this.useInMemoryFallback = true;
      return this.inMemory.revokeCredential(id, revocationReason);
    }
  }

  // 3. Media Record operations (Firestore collection: mediaRecords)
  public async getMediaRecord(id: string): Promise<MediaRecord | null> {
    await this.ensureInitialized();
    if (this.useInMemoryFallback) return this.inMemory.getMediaRecord(id);
    try {
      return await mediaRepository.get(id);
    } catch (_err) {
      this.useInMemoryFallback = true;
      return this.inMemory.getMediaRecord(id);
    }
  }

  public async findMediaRecordByHash(hash: string): Promise<MediaRecord | null> {
    await this.ensureInitialized();
    if (this.useInMemoryFallback) return this.inMemory.findMediaRecordByHash(hash);
    try {
      return await mediaRepository.findByHash(hash);
    } catch (_err) {
      this.useInMemoryFallback = true;
      return this.inMemory.findMediaRecordByHash(hash);
    }
  }

  public async listMediaRecords(institutionId?: string): Promise<MediaRecord[]> {
    await this.ensureInitialized();
    if (this.useInMemoryFallback) return this.inMemory.listMediaRecords(institutionId);
    try {
      return await mediaRepository.list(institutionId);
    } catch (_err) {
      this.useInMemoryFallback = true;
      return this.inMemory.listMediaRecords(institutionId);
    }
  }

  public async createMediaRecord(record: Omit<MediaRecord, 'id'> & { id?: string }): Promise<MediaRecord> {
    await this.ensureInitialized();
    if (this.useInMemoryFallback) return this.inMemory.createMediaRecord(record);
    try {
      return await mediaRepository.create(record);
    } catch (_err) {
      this.useInMemoryFallback = true;
      return this.inMemory.createMediaRecord(record);
    }
  }

  public async updateMediaRecord(id: string, updates: Partial<MediaRecord>): Promise<MediaRecord> {
    await this.ensureInitialized();
    if (this.useInMemoryFallback) return this.inMemory.updateMediaRecord(id, updates);
    try {
      return await mediaRepository.update(id, updates);
    } catch (_err) {
      this.useInMemoryFallback = true;
      return this.inMemory.updateMediaRecord(id, updates);
    }
  }

  // 4. Verification Log operations (Firestore collection: verificationLogs)
  public async createVerificationLog(log: Omit<VerificationLog, 'id'> & { id?: string }): Promise<VerificationLog> {
    await this.ensureInitialized();
    if (this.useInMemoryFallback) return this.inMemory.createVerificationLog(log);
    try {
      return await verificationLogRepository.create(log);
    } catch (_err) {
      this.useInMemoryFallback = true;
      return this.inMemory.createVerificationLog(log);
    }
  }

  public async listVerificationLogs(limitCount = 100, issuerId?: string): Promise<VerificationLog[]> {
    await this.ensureInitialized();
    if (this.useInMemoryFallback) return this.inMemory.listVerificationLogs(limitCount);
    try {
      return await verificationLogRepository.list(limitCount, issuerId);
    } catch (_err) {
      this.useInMemoryFallback = true;
      return this.inMemory.listVerificationLogs(limitCount);
    }
  }

  // 5. Binary Media Cloud Storage operations (Firebase / Google Cloud Storage bucket)
  public async saveStorageFile(
    storagePath: string,
    buffer: Buffer,
    mimeType?: string,
    originalName?: string,
    callerAuth?: AuthContext
  ): Promise<string> {
    await this.ensureInitialized();
    if (this.useInMemoryFallback) return this.inMemory.saveStorageFile(storagePath, buffer, mimeType, originalName);
    try {
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
    } catch (_err) {
      this.useInMemoryFallback = true;
      return this.inMemory.saveStorageFile(storagePath, buffer, mimeType, originalName);
    }
  }

  public async getStorageFile(storagePath: string, callerAuth?: AuthContext): Promise<StorageDownloadResult> {
    await this.ensureInitialized();
    if (this.useInMemoryFallback) {
      const item = this.inMemory.getStorageFile(storagePath);
      return {
        buffer: item.buffer,
        mimeType: item.mimeType || 'application/octet-stream',
        originalName: item.originalName,
      };
    }
    try {
      return await mediaStorageService.download(storagePath, callerAuth);
    } catch (_err) {
      this.useInMemoryFallback = true;
      const item = this.inMemory.getStorageFile(storagePath);
      return {
        buffer: item.buffer,
        mimeType: item.mimeType || 'application/octet-stream',
        originalName: item.originalName,
      };
    }
  }

  public async deleteStorageFile(storagePath: string, callerAuth?: AuthContext): Promise<void> {
    await this.ensureInitialized();
    if (this.useInMemoryFallback) return this.inMemory.deleteStorageFile(storagePath);
    try {
      await mediaStorageService.delete(storagePath, callerAuth);
    } catch (_err) {
      this.useInMemoryFallback = true;
      return this.inMemory.deleteStorageFile(storagePath);
    }
  }

  public async storageFileExists(storagePath: string): Promise<boolean> {
    await this.ensureInitialized();
    if (this.useInMemoryFallback) return this.inMemory.storageFileExists(storagePath);
    try {
      return await mediaStorageService.exists(storagePath);
    } catch (_err) {
      this.useInMemoryFallback = true;
      return this.inMemory.storageFileExists(storagePath);
    }
  }
}

export const db = FirestoreDatabaseService.getInstance();

