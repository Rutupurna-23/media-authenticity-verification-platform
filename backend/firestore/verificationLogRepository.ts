import { firestore } from '../../functions/src/auth/firebaseAdmin.js';
import { VerificationLog } from '../../types.js';

export class VerificationLogRepository {
  private collection = firestore.collection('verificationLogs');

  async create(log: Omit<VerificationLog, 'id'> & { id?: string }): Promise<VerificationLog> {
    if (!log.mediaHash || !log.verdict) {
      throw new Error('INVALID_ARGUMENT: mediaHash and verdict are required for verification log.');
    }

    const id = log.id || `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const docRef = this.collection.doc(id);
    const newLog: VerificationLog = {
      id,
      mediaHash: log.mediaHash,
      verdict: log.verdict,
      deepfakeScore: log.deepfakeScore !== undefined ? log.deepfakeScore : null,
      isSigned: !!log.isSigned,
      issuerId: log.issuerId || null,
      tamperDetected: !!log.tamperDetected,
      checkedAt: log.checkedAt || new Date().toISOString(),
      details: log.details || '',
      institutionName: log.institutionName,
      credentialStatus: log.credentialStatus,
    };

    await docRef.set(newLog);
    return newLog;
  }

  async list(limitCount = 100, issuerId?: string): Promise<VerificationLog[]> {
    try {
      let query: FirebaseFirestore.Query = this.collection;

      if (issuerId) {
        query = query.where('issuerId', '==', issuerId);
      }

      const snapshot = await query.limit(limitCount).get();

      const logs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<VerificationLog, 'id'>),
      }));

      return logs.sort(
        (a, b) =>
          new Date(b.checkedAt).getTime() - new Date(a.checkedAt).getTime()
      );
    } catch (_err) {
      const snapshot = await this.collection.get();

      let logs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<VerificationLog, 'id'>),
      }));

      if (issuerId) {
        logs = logs.filter((log) => log.issuerId === issuerId);
      }

      return logs
        .sort(
          (a, b) =>
            new Date(b.checkedAt).getTime() - new Date(a.checkedAt).getTime()
        )
        .slice(0, limitCount);
    }
  }
}

export const verificationLogRepository = new VerificationLogRepository();
