import * as path from 'path';
import crypto from 'crypto';
import { kmsProvider } from '../../functions/src/media/kmsProvider.js';
export class InMemoryDB {
    static instance;
    initPromise = null;
    institutions = new Map();
    credentials = new Map();
    mediaRecords = new Map();
    verificationLogs = [];
    storageFiles = new Map();
    constructor() {
        this.ensureInitialized();
    }
    static getInstance() {
        if (!InMemoryDB.instance) {
            InMemoryDB.instance = new InMemoryDB();
        }
        return InMemoryDB.instance;
    }
    async ensureInitialized() {
        if (!this.initPromise) {
            this.initPromise = this.seedInitialData();
        }
        await this.initPromise;
    }
    async seedInitialData() {
        const now = new Date().toISOString();
        // 1. Seed Institutions
        const inst1 = {
            id: 'inst-fema',
            name: 'Federal Emergency Management Agency (FEMA)',
            domain: 'fema.gov',
            status: 'ACTIVE',
            createdAt: '2025-01-10T00:00:00.000Z',
        };
        const inst2 = {
            id: 'inst-who',
            name: 'World Health Organization (WHO Dispatch)',
            domain: 'who.int',
            status: 'ACTIVE',
            createdAt: '2025-02-15T00:00:00.000Z',
        };
        const inst3 = {
            id: 'inst-noaa',
            name: 'National Oceanic & Atmospheric Administration (NOAA)',
            domain: 'noaa.gov',
            status: 'ACTIVE',
            createdAt: '2025-03-01T00:00:00.000Z',
        };
        this.institutions.set(inst1.id, inst1);
        this.institutions.set(inst2.id, inst2);
        this.institutions.set(inst3.id, inst3);
        // 2. Generate and seed Active Credentials with KMS keys
        const credPair1 = await kmsProvider.generateKeyPair('RSA-PSS-SHA256', 'cred-fema-primary');
        const cred1 = {
            id: 'cred-fema-primary',
            institutionId: inst1.id,
            publicKey: credPair1.publicKeyPem,
            keyAlgorithm: 'RSA-PSS-SHA256',
            status: 'ACTIVE',
            revokedAt: null,
            revocationReason: null,
            createdAt: '2025-01-11T00:00:00.000Z',
        };
        this.credentials.set(cred1.id, cred1);
        const credPair2 = await kmsProvider.generateKeyPair('ECDSA-P256-SHA256', 'cred-who-active');
        const cred2 = {
            id: 'cred-who-active',
            institutionId: inst2.id,
            publicKey: credPair2.publicKeyPem,
            keyAlgorithm: 'ECDSA-P256-SHA256',
            status: 'ACTIVE',
            revokedAt: null,
            revocationReason: null,
            createdAt: '2025-02-16T00:00:00.000Z',
        };
        this.credentials.set(cred2.id, cred2);
        // Seed a REVOKED Credential for testing revocation alerts
        const credPairRevoked = await kmsProvider.generateKeyPair('RSA-PSS-SHA256', 'cred-fema-compromised-2024');
        const credRevoked = {
            id: 'cred-fema-compromised-2024',
            institutionId: inst1.id,
            publicKey: credPairRevoked.publicKeyPem,
            keyAlgorithm: 'RSA-PSS-SHA256',
            status: 'REVOKED',
            revokedAt: '2026-04-12T14:30:00.000Z',
            revocationReason: 'Suspected private key exposure during security perimeter audit (CVE-2026-0812)',
            createdAt: '2024-06-01T00:00:00.000Z',
        };
        this.credentials.set(credRevoked.id, credRevoked);
        // 3. Seed Sample Official Media Records
        // Seed Sample 1: Signed FEMA Emergency Advisory
        const femaHash = '4a8f12c93b6e0d7a5c8e2f1b4d9a0c3e7f6a8b1c2d3e4f5a6b7c8d9e0f1a2b3c';
        const femaNoticeContent = Buffer.from('OFFICIAL FEMA EMERGENCY ADVISORY: Level 4 Severe Coastal Weather Alert issued for Eastern Seaboard. Immediate evacuation orders in effect.');
        const femaStoragePath = `media/institutions/inst-fema/official_emergency_advisory_2026.pdf`;
        this.storageFiles.set(femaStoragePath, {
            buffer: femaNoticeContent,
            mimeType: 'application/pdf',
            originalName: 'official_emergency_advisory_2026.pdf',
        });
        const femaSignature = await kmsProvider.signHash(cred1.id, femaHash, 'RSA-PSS-SHA256');
        const media1 = {
            id: 'rec-fema-001',
            institutionId: inst1.id,
            credentialId: cred1.id,
            mediaHash: femaHash,
            mediaType: 'EMERGENCY',
            signature: femaSignature,
            storagePath: femaStoragePath,
            blockchainTxHash: `0x${femaHash.substring(0, 40)}`,
            status: 'SIGNED',
            createdAt: '2026-08-01T10:00:00.000Z',
            signedAt: '2026-08-01T10:05:00.000Z',
            originalFileName: 'official_emergency_advisory_2026.pdf',
            fileSizeBytes: femaNoticeContent.length,
            mimeType: 'application/pdf',
            title: 'FEMA Level 4 Coastal Evacuation Notice',
        };
        this.mediaRecords.set(media1.id, media1);
        // Seed Sample 2: Revoked Credential Signed Media (Will trigger PROVEN_FAKE due to revocation)
        const revokedContent = Buffer.from('DEPRECATED BULLETIN: Old 2024 Disaster Assistance Guidelines');
        const revokedHash = '94c32e4102340e36abef1234567890abcdef1234567890abcdef1234567890ab';
        const revokedStoragePath = `media/institutions/inst-fema/old_bulletin_2024.pdf`;
        this.storageFiles.set(revokedStoragePath, {
            buffer: revokedContent,
            mimeType: 'application/pdf',
            originalName: 'old_bulletin_2024.pdf',
        });
        const revokedSignature = await kmsProvider.signHash(credRevoked.id, revokedHash, 'RSA-PSS-SHA256');
        const mediaRevoked = {
            id: 'rec-fema-revoked-002',
            institutionId: inst1.id,
            credentialId: credRevoked.id,
            mediaHash: revokedHash,
            mediaType: 'NOTICE',
            signature: revokedSignature,
            storagePath: revokedStoragePath,
            blockchainTxHash: null,
            status: 'SIGNED',
            createdAt: '2024-06-10T12:00:00.000Z',
            signedAt: '2024-06-10T12:02:00.000Z',
            originalFileName: 'old_bulletin_2024.pdf',
            fileSizeBytes: revokedContent.length,
            mimeType: 'application/pdf',
            title: 'Discontinued FEMA 2024 Guidelines (Signed with Revoked Key)',
        };
        this.mediaRecords.set(mediaRevoked.id, mediaRevoked);
        // Seed Sample 3: Pending/Unsigned Media Record
        const unsignedContent = Buffer.from('DRAFT NOAA Weather Radar Summary (Pending Director Signature)');
        const unsignedHash = '113c1d7c1f529dcc2b7e4b38cfc4b7ea2f6a00e9936614af058f5b6cdc5c1a87';
        const unsignedStoragePath = `media/institutions/inst-noaa/radar_draft.mp4`;
        this.storageFiles.set(unsignedStoragePath, {
            buffer: unsignedContent,
            mimeType: 'video/mp4',
            originalName: 'radar_draft.mp4',
        });
        const mediaUnsigned = {
            id: 'rec-noaa-003',
            institutionId: inst3.id,
            credentialId: '',
            mediaHash: unsignedHash,
            mediaType: 'VIDEO',
            signature: null,
            storagePath: unsignedStoragePath,
            blockchainTxHash: null,
            status: 'PENDING_SIGNATURE',
            createdAt: '2026-08-15T09:30:00.000Z',
            signedAt: null,
            originalFileName: 'radar_draft.mp4',
            fileSizeBytes: unsignedContent.length,
            mimeType: 'video/mp4',
            title: 'NOAA Radar Draft Video (Unsigned)',
        };
        this.mediaRecords.set(mediaUnsigned.id, mediaUnsigned);
        // Initial Verification Log
        this.verificationLogs.push({
            id: 'log-seed-001',
            mediaHash: femaHash,
            verdict: 'AUTHENTIC',
            deepfakeScore: 0.01,
            isSigned: true,
            issuerId: inst1.id,
            tamperDetected: false,
            checkedAt: '2026-08-16T06:00:00.000Z',
            details: 'Automated gateway health verification check succeeded.',
            institutionName: inst1.name,
            credentialStatus: 'ACTIVE',
        });
    }
    // Database helper methods
    async getInstitution(id) {
        return this.institutions.get(id) || null;
    }
    async listInstitutions() {
        return Array.from(this.institutions.values());
    }
    async createInstitution(inst) {
        const id = inst.id || `inst-${Date.now()}`;
        const newInst = { ...inst, id };
        this.institutions.set(id, newInst);
        return newInst;
    }
    async getCredential(id) {
        return this.credentials.get(id) || null;
    }
    async listCredentials(institutionId) {
        const all = Array.from(this.credentials.values());
        if (institutionId) {
            return all.filter((c) => c.institutionId === institutionId);
        }
        return all;
    }
    async createCredential(cred) {
        const id = cred.id || `cred-${Date.now()}`;
        const newCred = { ...cred, id };
        this.credentials.set(id, newCred);
        return newCred;
    }
    async updateCredential(id, updates) {
        const existing = this.credentials.get(id);
        if (!existing) {
            throw new Error(`Credential '${id}' not found`);
        }
        const updated = { ...existing, ...updates };
        this.credentials.set(id, updated);
        return updated;
    }
    async getMediaRecord(id) {
        return this.mediaRecords.get(id) || null;
    }
    async findMediaRecordByHash(hash) {
        const normalized = hash.toLowerCase();
        for (const record of this.mediaRecords.values()) {
            if (record.mediaHash.toLowerCase() === normalized) {
                return record;
            }
        }
        return null;
    }
    async listMediaRecords(institutionId) {
        const all = Array.from(this.mediaRecords.values());
        if (institutionId) {
            return all.filter((r) => r.institutionId === institutionId);
        }
        return all;
    }
    createMediaRecord(record) {
        const id = record.id || `rec-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        const newRec = { id, ...record };
        this.mediaRecords.set(id, newRec);
        return newRec;
    }
    async updateMediaRecord(id, updates) {
        const existing = this.mediaRecords.get(id);
        if (!existing) {
            throw new Error(`MediaRecord '${id}' not found`);
        }
        const updated = { ...existing, ...updates };
        this.mediaRecords.set(id, updated);
        return updated;
    }
    async createVerificationLog(log) {
        const id = `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        const newLog = { ...log, id };
        this.verificationLogs.unshift(newLog);
        return newLog;
    }
    async listVerificationLogs(limitCount = 100) {
        return this.verificationLogs.slice(0, limitCount);
    }
    async saveStorageFile(storagePath, buffer, mimeType, originalName) {
        this.storageFiles.set(storagePath, {
            buffer,
            mimeType,
            originalName: originalName || path.basename(storagePath),
        });
        return storagePath;
    }
    getStorageFile(storagePath) {
        const file = this.storageFiles.get(storagePath);
        if (!file) {
            throw new Error(`NOT_FOUND: Storage object '${storagePath}' not found in storage.`);
        }
        return file;
    }
    async updateInstitution(id, updates) {
        const existing = this.institutions.get(id);
        if (!existing)
            throw new Error(`Institution '${id}' not found`);
        const updated = { ...existing, ...updates };
        this.institutions.set(id, updated);
        return updated;
    }
    async revokeCredential(id, reason) {
        const existing = this.credentials.get(id);
        if (!existing)
            throw new Error(`Credential '${id}' not found`);
        const updated = { ...existing, status: 'REVOKED', revokedAt: new Date().toISOString(), revocationReason: reason };
        this.credentials.set(id, updated);
        return updated;
    }
    async deleteStorageFile(storagePath) {
        this.storageFiles.delete(storagePath);
    }
    async storageFileExists(storagePath) {
        return this.storageFiles.has(storagePath);
    }
}
export const db = InMemoryDB.getInstance();
