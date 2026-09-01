import { db } from '../backend/db.js';
import { kmsProvider } from '../functions/src/media/kmsProvider.js';
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

const WHO_ISSUER_AUTH: AuthContext = {
  uid: 'who-issuer-test',
  email: 'issuer@who.int',
  role: 'INSTITUTIONAL_ISSUER',
  institutionId: 'inst-who',
};

const PUBLIC_AUTH: AuthContext = {
  uid: 'public-user',
  email: 'public@user.org',
  role: 'PUBLIC_RECIPIENT',
};

export async function runActiveAuthorityTests() {
  console.log('\n======================================================');
  console.log('🏛 RUNNING ACTIVE ISSUING AUTHORITY & TENANT ISOLATION TESTS');
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

  // 1. Institution Resolution & Seeding
  const femaInst = await db.getInstitution('inst-fema');
  const whoInst = await db.getInstitution('inst-who');
  const noaaInst = await db.getInstitution('inst-noaa');

  assert(femaInst !== null && femaInst.id === 'inst-fema', 'TEST 01: FEMA institution record resolved');
  assert(whoInst !== null && whoInst.id === 'inst-who', 'TEST 02: WHO institution record resolved');
  assert(noaaInst !== null && noaaInst.id === 'inst-noaa', 'TEST 03: NOAA institution record resolved');

  // 2. Active Credential Lookup
  const femaCreds = await db.listCredentials('inst-fema');
  const activeFemaCred = femaCreds.find((c) => c.status === 'ACTIVE');

  assert(activeFemaCred !== undefined && activeFemaCred.id === 'cred-fema-primary', 'TEST 04: Active FEMA credential resolved');
  assert(activeFemaCred?.keyAlgorithm === 'RSA-PSS-SHA256', 'TEST 05: Active FEMA credential key algorithm is RSA-PSS-SHA256');

  // 3. Zero-Exposure Guarantee
  const safeCred = activeFemaCred as any;
  assert(!safeCred.privateKey && !safeCred.privateKeyPem && !safeCred.secret, 'TEST 06: Zero-Exposure Guarantee: No private key material exposed');

  // 4. Tenant Isolation Enforcement (FEMA cannot use WHO or NOAA credentials)
  let crossSignError: Error | null = null;
  try {
    await MediaService.signMedia(
      FEMA_ISSUER_AUTH,
      {
        mediaHash: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2',
        credentialId: 'cred-who-active',
        institutionId: 'inst-fema',
      },
      (id) => db.getCredential(id),
      (id) => db.getMediaRecord(id),
      (id, updates) => db.updateMediaRecord(id, updates)
    );
  } catch (err: any) {
    crossSignError = err;
  }
  assert(
    crossSignError !== null &&
      (crossSignError.message.includes('PERMISSION_DENIED') || crossSignError.message.includes('does not belong')),
    'TEST 07: Tenant Isolation: FEMA issuer cannot sign with WHO credential'
  );

  // 5. Public Recipient Cannot Sign
  let publicSignError: Error | null = null;
  try {
    await MediaService.signMedia(
      PUBLIC_AUTH,
      {
        mediaHash: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2',
        credentialId: 'cred-fema-primary',
        institutionId: 'inst-fema',
      },
      (id) => db.getCredential(id),
      (id) => db.getMediaRecord(id),
      (id, updates) => db.updateMediaRecord(id, updates)
    );
  } catch (err: any) {
    publicSignError = err;
  }
  assert(publicSignError !== null && publicSignError.message.includes('PERMISSION_DENIED'), 'TEST 08: RBAC: Public recipient cannot sign media');

  // 6. SHA-256 Hash Generation & Signing Flow
  const sampleBytes = Buffer.from('OFFICIAL_FEMA_PUBLIC_NOTICE_2026_TEST_BYTES');
  const actualHash = crypto.createHash('sha256').update(sampleBytes).digest('hex');

  assert(actualHash.length === 64 && /^[0-9a-f]{64}$/i.test(actualHash), 'TEST 09: SHA-256 is 64 hexadecimal characters');

  const mediaRec = await db.createMediaRecord({
    institutionId: 'inst-fema',
    credentialId: 'cred-fema-primary',
    mediaHash: actualHash,
    mediaType: 'NOTICE',
    storagePath: 'media/institutions/inst-fema/test_notice.pdf',
    originalFileName: 'test_notice.pdf',
    status: 'PENDING_SIGNATURE',
    createdAt: new Date().toISOString(),
    signature: null,
    blockchainTxHash: null,
  });

  const signRes = await MediaService.signMedia(
    FEMA_ISSUER_AUTH,
    {
      mediaRecordId: mediaRec.id,
      credentialId: 'cred-fema-primary',
      institutionId: 'inst-fema',
    },
    (id) => db.getCredential(id),
    (id) => db.getMediaRecord(id),
    (id, updates) => db.updateMediaRecord(id, updates)
  );

  assert(signRes.status === 'SIGNED' && typeof signRes.signature === 'string', 'TEST 10: Signing generates valid KMS signature');

  // 7. Verification Engine Tests
  const authenticVerify = await VerificationService.verifyMedia(
    { mediaHash: actualHash },
    (h) => db.findMediaRecordByHash(h),
    (id) => db.getCredential(id),
    (id) => db.getInstitution(id),
    (log) => db.createVerificationLog(log)
  );
  assert(authenticVerify.verdict === 'AUTHENTIC' && authenticVerify.isSigned === true, 'TEST 11: Original file verifies as AUTHENTIC');

  const tamperedHash = crypto.createHash('sha256').update('MODIFIED_TAMPERED_BYTES').digest('hex');
  const tamperedVerify = await VerificationService.verifyMedia(
    { mediaHash: tamperedHash, skipAutoRegister: true },
    (h) => db.findMediaRecordByHash(h),
    (id) => db.getCredential(id),
    (id) => db.getInstitution(id),
    (log) => db.createVerificationLog(log)
  );
  assert(tamperedVerify.verdict === 'UNSIGNED' || tamperedVerify.tamperDetected === true, 'TEST 12: Modified file returns UNSIGNED / Tamper');

  // 8. Admin Lifecycle: Revoke and verify revocation cascade
  const tempCred = await CredentialService.issueCredential(
    ADMIN_AUTH,
    { institutionId: 'inst-fema', keyAlgorithm: 'RSA-PSS-SHA256' },
    (c) => db.createCredential(c)
  );
  const revokedCred = await CredentialService.revokeCredential(
    ADMIN_AUTH,
    { credentialId: tempCred.id, revocationReason: 'Security audit test' },
    (id) => db.getCredential(id),
    (id, updates) => db.updateCredential(id, updates)
  );
  assert(revokedCred.status === 'REVOKED', 'TEST 13: System Admin can revoke credentials');

  console.log(`\n======================================================`);
  console.log(`🏁 ACTIVE AUTHORITY TESTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`======================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith('activeAuthority.test.ts')) {
  runActiveAuthorityTests().catch((err) => {
    console.error('Test execution error:', err);
    process.exit(1);
  });
}
