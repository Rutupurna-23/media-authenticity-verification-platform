import crypto from 'crypto';
import { institutionRepository } from './institutionRepository.js';
import { credentialRepository } from './credentialRepository.js';
import { mediaRepository } from './mediaRepository.js';
import { verificationLogRepository } from './verificationLogRepository.js';
import { mediaStorageService } from '../storage/mediaStorageService.js';
import {
  kmsProvider,
  NodeCryptoKMSProvider,
  hydrateDevelopmentKmsVault,
} from '../../../functions/src/media/kmsProvider.js';
import { Institution, Credential } from '../../types.js';
import { AuthContext } from '../../../functions/src/auth/authService.js';

const SYSTEM_ADMIN_AUTH: AuthContext = {
  uid: 'system-admin-init',
  email: 'admin@verification-gateway.gov',
  role: 'SYSTEM_ADMIN',
};

export async function seedInitialFirestoreData(): Promise<void> {
  try {
    // 1. ALWAYS hydrate the development KMS vault on every startup/restart
    hydrateDevelopmentKmsVault();

    if (!process.env.FIRESTORE_EMULATOR_HOST) {
      return;
    }

    const existing = await institutionRepository.list();
    if (existing && existing.length > 0) {

      const femaRec = await mediaRepository.get('rec-fema-001');
      if (femaRec && femaRec.mediaHash) {
        const expectedSig = await kmsProvider.signHash('cred-fema-primary', femaRec.mediaHash, 'RSA-PSS-SHA256');
        if (femaRec.signature !== expectedSig) {
          await mediaRepository.update('rec-fema-001', { signature: expectedSig });
        }
      }
      return;
    }

    console.log('Seeding initial verified institutions & cryptographic credentials to Firestore...');

    // 1. Seed Institutions
    const inst1: Institution = await institutionRepository.create(SYSTEM_ADMIN_AUTH, {
      id: 'inst-fema',
      name: 'Federal Emergency Management Agency (FEMA)',
      domain: 'fema.gov',
      status: 'ACTIVE',
      createdAt: '2025-01-10T00:00:00.000Z',
    });

    const inst2: Institution = await institutionRepository.create(SYSTEM_ADMIN_AUTH, {
      id: 'inst-who',
      name: 'World Health Organization (WHO Dispatch)',
      domain: 'who.int',
      status: 'ACTIVE',
      createdAt: '2025-02-15T00:00:00.000Z',
    });

    const inst3: Institution = await institutionRepository.create(SYSTEM_ADMIN_AUTH, {
      id: 'inst-noaa',
      name: 'National Oceanic & Atmospheric Administration (NOAA)',
      domain: 'noaa.gov',
      status: 'ACTIVE',
      createdAt: '2025-03-01T00:00:00.000Z',
    });

    // 2. Generate and seed Active Credentials with KMS keys
    const credPair1 = await kmsProvider.generateKeyPair('RSA-PSS-SHA256', 'cred-fema-primary');
    const cred1: Credential = await credentialRepository.create({
      id: 'cred-fema-primary',
      institutionId: inst1.id,
      publicKey: credPair1.publicKeyPem,
      keyAlgorithm: 'RSA-PSS-SHA256',
      status: 'ACTIVE',
      revokedAt: null,
      revocationReason: null,
      createdAt: '2025-01-11T00:00:00.000Z',
    });
    const privKey1 = NodeCryptoKMSProvider.getPrivateKey(credPair1.privateKeyId);
    if (privKey1) {
      NodeCryptoKMSProvider.registerKey(cred1.id, privKey1);
    }

    const credPair2 = await kmsProvider.generateKeyPair('ECDSA-P256-SHA256', 'cred-who-active');
    const cred2: Credential = await credentialRepository.create({
      id: 'cred-who-active',
      institutionId: inst2.id,
      publicKey: credPair2.publicKeyPem,
      keyAlgorithm: 'ECDSA-P256-SHA256',
      status: 'ACTIVE',
      revokedAt: null,
      revocationReason: null,
      createdAt: '2025-02-16T00:00:00.000Z',
    });
    const privKey2 = NodeCryptoKMSProvider.getPrivateKey(credPair2.privateKeyId);
    if (privKey2) {
      NodeCryptoKMSProvider.registerKey(cred2.id, privKey2);
    }

    // Seed a REVOKED Credential for testing revocation alerts
    const credPairRevoked = await kmsProvider.generateKeyPair('RSA-PSS-SHA256', 'cred-fema-compromised-2024');
    const credRevoked: Credential = await credentialRepository.create({
      id: 'cred-fema-compromised-2024',
      institutionId: inst1.id,
      publicKey: credPairRevoked.publicKeyPem,
      keyAlgorithm: 'RSA-PSS-SHA256',
      status: 'REVOKED',
      revokedAt: '2026-04-12T14:30:00.000Z',
      revocationReason: 'Suspected private key exposure during security perimeter audit (CVE-2026-0812)',
      createdAt: '2024-06-01T00:00:00.000Z',
    });
    const privKeyRevoked = NodeCryptoKMSProvider.getPrivateKey(credPairRevoked.privateKeyId);
    if (privKeyRevoked) {
      NodeCryptoKMSProvider.registerKey(credRevoked.id, privKeyRevoked);
    }

    // 3. Seed Sample Official Media Records
    // Seed Sample 1: Signed FEMA Emergency Advisory
    const femaHash = '4a8f12c93b6e0d7a5c8e2f1b4d9a0c3e7f6a8b1c2d3e4f5a6b7c8d9e0f1a2b3c';
    const femaNoticeContent = Buffer.from(
      'OFFICIAL FEMA EMERGENCY ADVISORY: Level 4 Severe Coastal Weather Alert issued for Eastern Seaboard. Immediate evacuation orders in effect.'
    );
    let femaStoragePath = `media/institutions/inst-fema/official_emergency_advisory_2026.pdf`;
    try {
      const uploadRes = await mediaStorageService.upload({
        institutionId: inst1.id,
        fileName: 'official_emergency_advisory_2026.pdf',
        fileBuffer: femaNoticeContent,
        mimeType: 'application/pdf',
        callerAuth: SYSTEM_ADMIN_AUTH,
      });
      femaStoragePath = uploadRes.storagePath;
    } catch (_storageErr) {
      // Storage emulator or offline mode fallback
    }

    const femaSignature = await kmsProvider.signHash(cred1.id, femaHash, 'RSA-PSS-SHA256');

    await mediaRepository.create({
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
    });

    // Seed Sample 2: Revoked Credential Signed Media (Will trigger PROVEN_FAKE due to revocation)
    const revokedContent = Buffer.from('DEPRECATED BULLETIN: Old 2024 Disaster Assistance Guidelines');
    const revokedHash = crypto.createHash('sha256').update(revokedContent).digest('hex');
    let revokedStoragePath = `media/institutions/inst-fema/old_bulletin_2024.pdf`;
    try {
      const uploadRes = await mediaStorageService.upload({
        institutionId: inst1.id,
        fileName: 'old_bulletin_2024.pdf',
        fileBuffer: revokedContent,
        mimeType: 'application/pdf',
        callerAuth: SYSTEM_ADMIN_AUTH,
      });
      revokedStoragePath = uploadRes.storagePath;
    } catch (_storageErr) {
      // Storage emulator or offline fallback
    }
    const revokedSignature = await kmsProvider.signHash(credRevoked.id, revokedHash, 'RSA-PSS-SHA256');

    await mediaRepository.create({
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
    });

    // Seed Sample 3: Pending/Unsigned Media Record
    const unsignedContent = Buffer.from('DRAFT NOAA Weather Radar Summary (Pending Director Signature)');
    const unsignedHash = crypto.createHash('sha256').update(unsignedContent).digest('hex');
    let unsignedStoragePath = `media/institutions/inst-noaa/radar_draft.mp4`;
    try {
      const uploadRes = await mediaStorageService.upload({
        institutionId: inst3.id,
        fileName: 'radar_draft.mp4',
        fileBuffer: unsignedContent,
        mimeType: 'video/mp4',
        callerAuth: SYSTEM_ADMIN_AUTH,
      });
      unsignedStoragePath = uploadRes.storagePath;
    } catch (_storageErr) {
      // Storage emulator or offline fallback
    }

    await mediaRepository.create({
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
    });

    // Initial Verification Log
    await verificationLogRepository.create({
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

    console.log('Firestore and Storage seed data initialization complete.');
  } catch (err) {
    console.warn('Firestore seeding notice (e.g. offline / emulator initialization):', err);
  }
}
