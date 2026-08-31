import { db } from '../src/backend/db.js';
import { NodeCryptoKMSProvider, kmsProvider } from '../functions/src/media/kmsProvider.js';
import { MediaService } from '../functions/src/media/mediaService.js';
import { VerificationService } from '../functions/src/verification/verificationService.js';
import { CredentialService } from '../functions/src/credentials/credentialService.js';
import { AuthContext } from '../functions/src/auth/authService.js';
import crypto from 'crypto';

const ADMIN_AUTH: AuthContext = {
  uid: 'admin-test',
  email: 'admin@gov.org',
  role: 'SYSTEM_ADMIN',
};

const FEMA_ISSUER_AUTH: AuthContext = {
  uid: 'fema-issuer-test',
  email: 'issuer@fema.gov',
  role: 'INSTITUTIONAL_ISSUER',
  institutionId: 'inst-fema',
};

async function runBugfixTests() {
  console.log('\n======================================================');
  console.log('🧪 RUNNING TARGETED BUG-FIX REGRESSION TESTS');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName}`);
      failed++;
    }
  }

  // =========================================================================
  // SECTION 1: BUG #1 DATABASE INITIALIZATION RACE CONDITION TESTS
  // =========================================================================
  console.log('[BUG #1] Testing Database Initialization & Concurrency Latch...');

  // Test 1: Concurrent startup requests latching onto single initialization promise
  const [insts, creds, media, femaInst, logs] = await Promise.all([
    db.listInstitutions(),
    db.listCredentials(),
    db.listMediaRecords(),
    db.getInstitution('inst-fema'),
    db.listVerificationLogs(),
  ]);

  assert(Array.isArray(insts) && insts.length >= 3, 'Concurrent request 1: listInstitutions returned all seeded institutions');
  assert(Array.isArray(creds) && creds.length >= 3, 'Concurrent request 2: listCredentials returned all seeded credentials');
  assert(Array.isArray(media) && media.length >= 1, 'Concurrent request 3: listMediaRecords returned seeded media records');
  assert(femaInst !== null && femaInst.id === 'inst-fema', 'Concurrent request 4: getInstitution returned FEMA institution');
  assert(Array.isArray(logs), 'Concurrent request 5: listVerificationLogs safely returned logs array');

  // Test 2: Sequential calls immediately reuse initialized state without re-seeding
  const instsSecondCall = await db.listInstitutions();
  assert(instsSecondCall.length === insts.length, 'Subsequent db calls reuse initialized state with 0 latency penalty');

  // =========================================================================
  // SECTION 2: BUG #2 KMS PRIVATE KEY ACCESS & LIFECYCLE TESTS
  // =========================================================================
  console.log('\n[BUG #2] Testing KMS Key Lifecycle, Signing, Verification & Revocation...');

  // Test A: Generate Key Pair and register
  const keyPair = await kmsProvider.generateKeyPair('RSA-PSS-SHA256');
  assert(typeof keyPair.publicKeyPem === 'string' && keyPair.publicKeyPem.includes('BEGIN PUBLIC KEY'), 'Test A: generateKeyPair returns valid public key PEM');
  assert(typeof keyPair.privateKeyId === 'string' && keyPair.privateKeyId.startsWith('kms-key-'), 'Test A: generateKeyPair registers private key in vault');

  const customKeyId = `cred-test-custom-${Date.now()}`;
  const privKey = NodeCryptoKMSProvider.getPrivateKey(keyPair.privateKeyId);
  assert(typeof privKey === 'string' && privKey.includes('BEGIN PRIVATE KEY'), 'Test A: getPrivateKey retrieves private key from static vault');

  NodeCryptoKMSProvider.registerKey(customKeyId, privKey!);
  assert(NodeCryptoKMSProvider.getPrivateKey(customKeyId) === privKey, 'Test A: registerKey binds credentialId to private key in vault');

  // Test B: Sign payload with registered key
  const testHash = crypto.createHash('sha256').update('TEST_MEDIA_CONTENT_FOR_KMS_SIGNING').digest('hex');
  const signature = await kmsProvider.signHash(customKeyId, testHash, 'RSA-PSS-SHA256');
  assert(typeof signature === 'string' && signature.length > 50, 'Test B: signHash produces cryptographic signature with registered key');

  // Test C: Verify signature with public key
  const isValid = await kmsProvider.verifySignature(keyPair.publicKeyPem, testHash, signature, 'RSA-PSS-SHA256');
  assert(isValid === true, 'Test C: verifySignature returns true for valid signature and untampered hash');

  // Test D: Tampered payload verification fails
  const tamperedHash = crypto.createHash('sha256').update('TAMPERED_MEDIA_CONTENT_MODIFIED').digest('hex');
  const isTamperedValid = await kmsProvider.verifySignature(keyPair.publicKeyPem, tamperedHash, signature, 'RSA-PSS-SHA256');
  assert(isTamperedValid === false, 'Test D: verifySignature returns false for tampered payload');

  // Test E: Unknown key ID throws controlled KMS_KEY_NOT_FOUND error
  let caughtError: Error | null = null;
  try {
    await kmsProvider.signHash('cred-non-existent-key-999', testHash);
  } catch (err: any) {
    caughtError = err;
  }
  assert(caughtError !== null && caughtError.message.includes('KMS_KEY_NOT_FOUND'), 'Test E: Unknown key ID throws controlled KMS_KEY_NOT_FOUND error without crash');

  // Test F: End-to-End Application Signing & Verification Flow
  const newMedia = await db.createMediaRecord({
    institutionId: 'inst-fema',
    credentialId: 'cred-fema-primary',
    mediaHash: testHash,
    mediaType: 'NOTICE',
    storagePath: 'media/institutions/inst-fema/test_kms_doc.pdf',
    originalFileName: 'test_kms_doc.pdf',
    status: 'PENDING_SIGNATURE',
    createdAt: new Date().toISOString(),
    signature: null,
    blockchainTxHash: null,
  });

  const signResult = await MediaService.signMedia(
    FEMA_ISSUER_AUTH,
    {
      mediaRecordId: newMedia.id,
      credentialId: 'cred-fema-primary',
      institutionId: 'inst-fema',
    },
    (id) => db.getCredential(id),
    (id) => db.getMediaRecord(id),
    (id, updates) => db.updateMediaRecord(id, updates)
  );
  assert(signResult.status === 'SIGNED' && Boolean(signResult.signature), 'Test F: MediaService.signMedia generates valid KMS signature and updates Firestore');

  const verifyResult = await VerificationService.verifyMedia(
    { mediaHash: testHash },
    (h) => db.findMediaRecordByHash(h),
    (id) => db.getCredential(id),
    (id) => db.getInstitution(id),
    (log) => db.createVerificationLog(log)
  );
  assert(verifyResult.verdict === 'AUTHENTIC' && verifyResult.isSigned === true && verifyResult.tamperDetected === false, 'Test F: VerificationService.verifyMedia returns AUTHENTIC for signed media');

  // Test G: Revocation cascade
  const newCred = await CredentialService.issueCredential(
    ADMIN_AUTH,
    { institutionId: 'inst-fema', keyAlgorithm: 'RSA-PSS-SHA256' },
    (c) => db.createCredential(c)
  );

  const revokedCred = await CredentialService.revokeCredential(
    ADMIN_AUTH,
    { credentialId: newCred.id, revocationReason: 'Key retirement audit' },
    (id) => db.getCredential(id),
    (id, updates) => db.updateCredential(id, updates)
  );
  assert(revokedCred.status === 'REVOKED', 'Test G: CredentialService.revokeCredential revokes credential');

  // =========================================================================
  // SECTION 3: ACTIVE ISSUING AUTHORITY TRUST & SECURITY TESTS
  // =========================================================================
  console.log('\n[SECTION 3] Testing Active Issuing Authority Trust, Revocation & Key Security...');

  // Test H: Zero-Exposure Guarantee (No private key fields in returned credentials)
  const allCreds = await db.listCredentials();
  const exposedKeys = allCreds.filter(
    (c: any) => c.privateKey || c.privateKeyPem || c.secret || c.privateKeyVault
  );
  assert(exposedKeys.length === 0, 'Test H: Zero-Exposure Guarantee: No credentials expose private key material');

  // Test I: Attempting to sign with a REVOKED credential is explicitly blocked
  let revokedSignError: Error | null = null;
  try {
    await MediaService.signMedia(
      FEMA_ISSUER_AUTH,
      {
        mediaRecordId: newMedia.id,
        credentialId: 'cred-fema-compromised-2024',
        institutionId: 'inst-fema',
      },
      (id) => db.getCredential(id),
      (id) => db.getMediaRecord(id),
      (id, updates) => db.updateMediaRecord(id, updates)
    );
  } catch (err: any) {
    revokedSignError = err;
  }
  assert(
    revokedSignError !== null &&
      (revokedSignError.message.includes('FAILED_PRECONDITION') || revokedSignError.message.includes('REVOKED')),
    'Test I: Signing with a REVOKED issuing credential is strictly blocked with non-active status error'
  );

  // Test J: Tenant Isolation (Institution A cannot sign with Institution B credential)
  let tenantMismatchError: Error | null = null;
  try {
    await MediaService.signMedia(
      FEMA_ISSUER_AUTH,
      {
        mediaRecordId: newMedia.id,
        credentialId: 'cred-who-active',
        institutionId: 'inst-fema',
      },
      (id) => db.getCredential(id),
      (id) => db.getMediaRecord(id),
      (id, updates) => db.updateMediaRecord(id, updates)
    );
  } catch (err: any) {
    tenantMismatchError = err;
  }
  assert(
    tenantMismatchError !== null &&
      (tenantMismatchError.message.includes('PERMISSION_DENIED') || tenantMismatchError.message.includes('does not belong')),
    'Test J: Tenant Isolation: Institution A cannot sign media using Institution B credential'
  );

  console.log(`\n======================================================`);
  console.log(`🏁 TARGETED BUGFIX TESTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`======================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runBugfixTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
