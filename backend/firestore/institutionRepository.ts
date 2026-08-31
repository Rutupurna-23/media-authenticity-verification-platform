import { firestore } from '../../functions/src/auth/firebaseAdmin.js';
import { Institution } from '../../types.js';
import { AuthService, AuthContext } from '../../functions/src/auth/authService.js';

export class InstitutionRepository {
  private collection = firestore.collection('institutions');

  async get(id: string): Promise<Institution | null> {
    if (!id) return null;
    const doc = await this.collection.doc(id).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...(doc.data() as Omit<Institution, 'id'>) };
  }

  async list(_callerAuth?: AuthContext): Promise<Institution[]> {
    try {
      const snapshot = await this.collection.orderBy('createdAt', 'desc').get();
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<Institution, 'id'>),
      }));
    } catch (_err) {
      const snapshot = await this.collection.get();
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<Institution, 'id'>),
      }));
    }
  }

  async create(callerAuth: AuthContext | undefined, inst: Omit<Institution, 'id'> & { id?: string }): Promise<Institution> {
    AuthService.assertSystemAdmin(callerAuth);

    if (!inst.name || !inst.domain) {
      throw new Error('INVALID_ARGUMENT: Institution name and domain are required.');
    }

    const id = inst.id || `inst-${Date.now()}`;
    const docRef = this.collection.doc(id);
    const newInst: Institution = {
      id,
      name: inst.name.trim(),
      domain: inst.domain.trim().toLowerCase(),
      status: inst.status || 'ACTIVE',
      createdAt: inst.createdAt || new Date().toISOString(),
    };

    await docRef.set(newInst);
    return newInst;
  }

  async update(callerAuth: AuthContext | undefined, id: string, updates: Partial<Institution>): Promise<Institution> {
    AuthService.assertSystemAdmin(callerAuth);

    const docRef = this.collection.doc(id);
    const existing = await this.get(id);
    if (!existing) {
      throw new Error(`NOT_FOUND: Institution '${id}' not found.`);
    }

    const cleanUpdates = { ...updates };
    delete (cleanUpdates as any).id;

    await docRef.update(cleanUpdates);
    return { ...existing, ...cleanUpdates };
  }
}

export const institutionRepository = new InstitutionRepository();
