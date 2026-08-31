import { firestore } from '../../functions/src/auth/firebaseAdmin.js';
import { MediaRecord } from '../../types.js';

export class MediaRepository {
  private collection = firestore.collection('mediaRecords');

  async get(id: string): Promise<MediaRecord | null> {
    if (!id) return null;
    const doc = await this.collection.doc(id).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...(doc.data() as Omit<MediaRecord, 'id'>) };
  }

  async findByHash(mediaHash: string): Promise<MediaRecord | null> {
    if (!mediaHash) return null;
    const normalized = mediaHash.trim().toLowerCase();

    // 1. Direct document ID lookup: media_manifests/{mediaHash} or mediaRecords/{mediaHash}
    try {
      const directDoc = await this.collection.doc(normalized).get();
      if (directDoc.exists) {
        return { id: directDoc.id, ...(directDoc.data() as Omit<MediaRecord, 'id'>) };
      }
    } catch (_err) {
      // Fall through to query if direct ID lookup fails
    }

    // 2. Query fallback: where('mediaHash', '==', normalized)
    const snapshot = await this.collection
      .where('mediaHash', '==', normalized)
      .limit(1)
      .get();

    if (snapshot.empty) {
      // Fallback query without lowercase if not found
      const fallbackSnapshot = await this.collection
        .where('mediaHash', '==', mediaHash.trim())
        .limit(1)
        .get();
      if (fallbackSnapshot.empty) return null;
      const doc = fallbackSnapshot.docs[0];
      return { id: doc.id, ...(doc.data() as Omit<MediaRecord, 'id'>) };
    }

    const doc = snapshot.docs[0];
    return { id: doc.id, ...(doc.data() as Omit<MediaRecord, 'id'>) };
  }

  async list(institutionId?: string): Promise<MediaRecord[]> {
    try {
      let query: FirebaseFirestore.Query = this.collection;
      if (institutionId) {
        query = query.where('institutionId', '==', institutionId);
      }
      const snapshot = await query.get();
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<MediaRecord, 'id'>),
      }));
    } catch (_err) {
      const snapshot = await this.collection.get();
      const all = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<MediaRecord, 'id'>),
      }));
      if (institutionId) {
        return all.filter((r) => r.institutionId === institutionId);
      }
      return all;
    }
  }

  async create(record: Omit<MediaRecord, 'id'> & { id?: string }): Promise<MediaRecord> {
    if (!record.institutionId || !record.mediaHash || !record.mediaType) {
      throw new Error('INVALID_ARGUMENT: institutionId, mediaHash, and mediaType are required.');
    }

    const id = record.id || `rec-${Date.now()}`;
    const docRef = this.collection.doc(id);
    const newRecord: MediaRecord = {
      id,
      institutionId: record.institutionId,
      credentialId: record.credentialId || '',
      mediaHash: record.mediaHash.toLowerCase(),
      mediaType: record.mediaType,
      signature: record.signature || null,
      storagePath: record.storagePath,
      blockchainTxHash: record.blockchainTxHash || null,
      status: record.status || 'PENDING_SIGNATURE',
      createdAt: record.createdAt || new Date().toISOString(),
      signedAt: record.signedAt || null,
      originalFileName: record.originalFileName,
      fileSizeBytes: record.fileSizeBytes,
      mimeType: record.mimeType,
      title: record.title || record.originalFileName,
    };

    await docRef.set(newRecord);
    return newRecord;
  }

  async update(id: string, updates: Partial<MediaRecord>): Promise<MediaRecord> {
    const docRef = this.collection.doc(id);
    const existing = await this.get(id);
    if (!existing) {
      throw new Error(`NOT_FOUND: MediaRecord '${id}' not found.`);
    }

    const cleanUpdates = { ...updates };
    delete (cleanUpdates as any).id;

    await docRef.update(cleanUpdates);
    return { ...existing, ...cleanUpdates };
  }
}

export const mediaRepository = new MediaRepository();
