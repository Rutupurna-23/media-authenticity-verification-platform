import { firestore } from '../../functions/src/auth/firebaseAdmin.js';
import { Credential } from '../../types.js';
import { AuthService, AuthContext } from '../../functions/src/auth/authService.js';

export class CredentialRepository {
  private collection = firestore.collection('credentials');

  async get(id: string): Promise<Credential | null> {
    if (!id) return null;
    const doc = await this.collection.doc(id).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...(doc.data() as Omit<Credential, 'id'>) };
  }

  async list(institutionId?: string): Promise<Credential[]> {
    try {
      let query: FirebaseFirestore.Query = this.collection;
      if (institutionId) {
        query = query.where('institutionId', '==', institutionId);
      }
      const snapshot = await query.get();
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<Credential, 'id'>),
      }));
    } catch (_err) {
      const snapshot = await this.collection.get();
      const all = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<Credential, 'id'>),
      }));
      if (institutionId) {
        return all.filter((c) => c.institutionId === institutionId);
      }
      return all;
    }
  }

  async create(cred: Omit<Credential, 'id'> & { id?: string }): Promise<Credential> {
    if (!cred.institutionId || !cred.publicKey || !cred.keyAlgorithm) {
      throw new Error('INVALID_ARGUMENT: institutionId, publicKey, and keyAlgorithm are required.');
    }

    const id = cred.id || `cred-${Date.now()}`;
    const docRef = this.collection.doc(id);
    const newCred: Credential = {
      id,
      institutionId: cred.institutionId,
      publicKey: cred.publicKey,
      keyAlgorithm: cred.keyAlgorithm,
      status: cred.status || 'ACTIVE',
      revokedAt: cred.revokedAt || null,
      revocationReason: cred.revocationReason || null,
      createdAt: cred.createdAt || new Date().toISOString(),
      expiresAt: cred.expiresAt,
    };

    await docRef.set(newCred);
    return newCred;
  }

  async update(id: string, updates: Partial<Credential>): Promise<Credential> {
    const docRef = this.collection.doc(id);
    const existing = await this.get(id);
    if (!existing) {
      throw new Error(`NOT_FOUND: Credential '${id}' not found.`);
    }

    const cleanUpdates = { ...updates };
    delete (cleanUpdates as any).id;

    await docRef.update(cleanUpdates);
    return { ...existing, ...cleanUpdates };
  }

  async revoke(callerAuth: AuthContext | undefined, id: string, revocationReason: string): Promise<Credential> {
    AuthService.assertSystemAdmin(callerAuth);

    if (!id) {
      throw new Error('INVALID_ARGUMENT: credentialId is required for revocation.');
    }
    if (!revocationReason || revocationReason.trim() === '') {
      throw new Error('INVALID_ARGUMENT: revocationReason is required.');
    }

    const existing = await this.get(id);
    if (!existing) {
      throw new Error(`NOT_FOUND: Credential '${id}' not found.`);
    }
    if (existing.status === 'REVOKED') {
      throw new Error(`FAILED_PRECONDITION: Credential '${id}' is already REVOKED.`);
    }

    const updates: Partial<Credential> = {
      status: 'REVOKED',
      revokedAt: new Date().toISOString(),
      revocationReason: revocationReason.trim(),
    };

    return await this.update(id, updates);
  }
}

export const credentialRepository = new CredentialRepository();
