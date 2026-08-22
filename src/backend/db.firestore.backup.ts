import {
  Institution,
  Credential,
  MediaRecord,
  VerificationLog,
} from '../types.js';
import { firestore } from './firebase.js';

const COLLECTIONS = {
  institutions: 'institutions',
  credentials: 'credentials',
  mediaRecords: 'mediaRecords',
  verificationLogs: 'verificationLogs',
} as const;

export class FirestoreDB {

  public async getInstitution(id: string): Promise<Institution | null> {
    const snapshot = await firestore
      .collection(COLLECTIONS.institutions)
      .doc(id)
      .get();

    if (!snapshot.exists) {
      return null;
    }

    return snapshot.data() as Institution;
  }

  public async listInstitutions(): Promise<Institution[]> {
    const snapshot = await firestore
      .collection(COLLECTIONS.institutions)
      .get();

    return snapshot.docs.map(
      (doc) => doc.data() as Institution
    );
  }

  public async createInstitution(
    inst: Omit<Institution, 'id'>
  ): Promise<Institution> {

    const id = `inst-${Date.now()}`;

    const newInst: Institution = {
      ...inst,
      id,
    };

    await firestore
      .collection(COLLECTIONS.institutions)
      .doc(id)
      .set(newInst);

    return newInst;
  }

  public async getCredential(
    id: string
  ): Promise<Credential | null> {

    const snapshot = await firestore
      .collection(COLLECTIONS.credentials)
      .doc(id)
      .get();

    if (!snapshot.exists) {
      return null;
    }

    return snapshot.data() as Credential;
  }

  public async listCredentials(
    institutionId?: string
  ): Promise<Credential[]> {

    let query: FirebaseFirestore.Query =
      firestore.collection(COLLECTIONS.credentials);

    if (institutionId) {
      query = query.where(
        'institutionId',
        '==',
        institutionId
      );
    }

    const snapshot = await query.get();

    return snapshot.docs.map(
      (doc) => doc.data() as Credential
    );
  }

  public async createCredential(
    cred: Omit<Credential, 'id'>
  ): Promise<Credential> {

    const id = `cred-${Date.now()}`;

    const newCred: Credential = {
      ...cred,
      id,
    };

    await firestore
      .collection(COLLECTIONS.credentials)
      .doc(id)
      .set(newCred);

    return newCred;
  }

  public async updateCredential(
    id: string,
    updates: Partial<Credential>
  ): Promise<Credential> {

    const existing = await this.getCredential(id);

    if (!existing) {
      throw new Error(`Credential '${id}' not found`);
    }

    const updated: Credential = {
      ...existing,
      ...updates,
    };

    await firestore
      .collection(COLLECTIONS.credentials)
      .doc(id)
      .set(updated);

    return updated;
  }

  public async getMediaRecord(
    id: string
  ): Promise<MediaRecord | null> {

    const snapshot = await firestore
      .collection(COLLECTIONS.mediaRecords)
      .doc(id)
      .get();

    if (!snapshot.exists) {
      return null;
    }

    return snapshot.data() as MediaRecord;
  }

  public async findMediaRecordByHash(
    hash: string
  ): Promise<MediaRecord | null> {

    const normalized = hash.toLowerCase();

    const snapshot = await firestore
      .collection(COLLECTIONS.mediaRecords)
      .where('mediaHash', '==', normalized)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    return snapshot.docs[0].data() as MediaRecord;
  }

  public async listMediaRecords(
    institutionId?: string
  ): Promise<MediaRecord[]> {

    let query: FirebaseFirestore.Query =
      firestore.collection(COLLECTIONS.mediaRecords);

    if (institutionId) {
      query = query.where(
        'institutionId',
        '==',
        institutionId
      );
    }

    const snapshot = await query.get();

    return snapshot.docs.map(
      (doc) => doc.data() as MediaRecord
    );
  }

  public async createMediaRecord(
    record: Omit<MediaRecord, 'id'>
  ): Promise<MediaRecord> {

    const id = `rec-${Date.now()}`;

    const newRecord: MediaRecord = {
      ...record,
      id,
    };

    await firestore
      .collection(COLLECTIONS.mediaRecords)
      .doc(id)
      .set(newRecord);

    return newRecord;
  }

  public async updateMediaRecord(
    id: string,
    updates: Partial<MediaRecord>
  ): Promise<MediaRecord> {

    const existing = await this.getMediaRecord(id);

    if (!existing) {
      throw new Error(
        `MediaRecord '${id}' not found`
      );
    }

    const updated: MediaRecord = {
      ...existing,
      ...updates,
    };

    await firestore
      .collection(COLLECTIONS.mediaRecords)
      .doc(id)
      .set(updated);

    return updated;
  }

  public async createVerificationLog(
    log: Omit<VerificationLog, 'id'>
  ): Promise<VerificationLog> {

    const id =
      `log-${Date.now()}-${Math.random()
        .toString(36)
        .substring(2, 6)}`;

    const newLog: VerificationLog = {
      ...log,
      id,
    };

    await firestore
      .collection(COLLECTIONS.verificationLogs)
      .doc(id)
      .set(newLog);

    return newLog;
  }

  public async listVerificationLogs(
    limitCount = 100
  ): Promise<VerificationLog[]> {

    const snapshot = await firestore
      .collection(COLLECTIONS.verificationLogs)
      .orderBy('checkedAt', 'desc')
      .limit(limitCount)
      .get();

    return snapshot.docs.map(
      (doc) => doc.data() as VerificationLog
    );
  }

  public async saveStorageFile(
    storagePath: string,
    buffer: Buffer,
    mimeType?: string,
    originalName?: string
  ): Promise<string> {

    throw new Error(
      'Cloud Storage migration is required for media uploads.'
    );
  }

  public getStorageFile(
    storagePath: string
  ): never {

    throw new Error(
      'Cloud Storage migration is required for media retrieval.'
    );
  }
}

export const db = new FirestoreDB();
