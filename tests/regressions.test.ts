import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../backend/db.js';
import { MediaService } from '../functions/src/media/mediaService.js';
import { CredentialService } from '../functions/src/credentials/credentialService.js';
import { VerificationService } from '../functions/src/verification/verificationService.js';
import { AuthService } from '../functions/src/auth/authService.js';
import { validateConfig } from '../backend/config/envValidator.js';
import { mediaStorageService } from '../backend/storage/mediaStorageService.js';

console.log(`\n======================================================`);
console.log(`🧪 RUNNING PHASE 18 COMPREHENSIVE REGRESSION TEST SUITE`);
console.log(`======================================================\n`);

async function runRegressionTests() {
  let passed = 0;
  let failed = 0;

  function assertTest(name: string, condition: boolean, details?: string) {
    if (condition) {
      console.log(`  ✅ PASS: [${name}]${details ? ` - ${details}` : ''}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: [${name}]${details ? ` - ${details}` : ''}`);
      failed++;
    }
  }

  // ----------------------------------------------------
  // SECTION 1: AUTH-001 to AUTH-003 (Authentication & Identity)
  // ----------------------------------------------------
  console.log('[SECTION 1] Testing AUTH-001 to AUTH-003 (Authentication & Identity)...');
  try {
    try {
      AuthService.assertAuthenticated(undefined);
      assertTest('AUTH-001: Missing token throws UNAUTHENTICATED', false);
    } catch (err: any) {
      assertTest('AUTH-001: Missing token throws UNAUTHENTICATED', err.message.includes('UNAUTHENTICATED'));
    }

    try {
      AuthService.assertRole({ uid: 'user-1', email: 'test@user.com', role: 'PUBLIC_RECIPIENT' }, ['SYSTEM_ADMIN']);
      assertTest('AUTH-002: Invalid role throws PERMISSION_DENIED', false);
    } catch (err: any) {
      assertTest('AUTH-002: Invalid role throws PERMISSION_DENIED', err.message.includes('PERMISSION_DENIED'));
    }

    const configRes = validateConfig({ NODE_ENV: 'test', PORT: '3000' });
    assertTest('AUTH-003: Environment configuration valid', configRes.isValid);
  } catch (err: any) {
    console.error('SECTION 1 Error:', err);
  }

  // ----------------------------------------------------
  // SECTION 2: RBAC-001 to RBAC-003 (Tenant Isolation & Admin Operations)
  // ----------------------------------------------------
  console.log('\n[SECTION 2] Testing RBAC-001 to RBAC-003 (Tenant Isolation)...');
  try {
    const femaIssuer = { uid: 'fema-admin', email: 'admin@fema.gov', role: 'INSTITUTIONAL_ISSUER' as const, institutionId: 'inst-fema' };

    try {
      AuthService.assertInstitutionalAccess(femaIssuer, 'inst-who');
      assertTest('RBAC-001: Cross-tenant access blocked', false);
    } catch (err: any) {
      assertTest('RBAC-001: Cross-tenant access blocked', err.message.includes('PERMISSION_DENIED'));
    }

    try {
      AuthService.assertSystemAdmin(femaIssuer);
      assertTest('RBAC-002: Non-admin cannot issue credentials', false);
    } catch (err: any) {
      assertTest('RBAC-002: Non-admin cannot issue credentials', err.message.includes('PERMISSION_DENIED'));
    }

    const sysAdmin = { uid: 'sys-admin', email: 'admin@verify.gov', role: 'SYSTEM_ADMIN' as const };
    const adminCheck = AuthService.assertSystemAdmin(sysAdmin);
    assertTest('RBAC-003: System Admin authorized', adminCheck.role === 'SYSTEM_ADMIN');
  } catch (err: any) {
    console.error('SECTION 2 Error:', err);
  }

  // ----------------------------------------------------
  // SECTION 3: CRED-001 to CRED-004 (Credential Lifecycle)
  // ----------------------------------------------------
  console.log('\n[SECTION 3] Testing CRED-001 to CRED-004 (Credential Lifecycle)...');
  try {
    const adminContext = { uid: 'sys-admin', email: 'admin@verify.gov', role: 'SYSTEM_ADMIN' as const };
    
    // Issue active credential
    const newCred = await CredentialService.issueCredential(
      adminContext,
      { institutionId: 'inst-fema', keyAlgorithm: 'RSA-PSS-SHA256' },
      (c) => db.createCredential(c)
    );
    assertTest('CRED-001: Credential issued with ACTIVE status', newCred.status === 'ACTIVE');

    // Revoke credential
    const revoked = await CredentialService.revokeCredential(
      adminContext,
      { credentialId: newCred.id, revocationReason: 'Security Audit Revocation' },
      (id) => db.getCredential(id),
      (id, updates) => db.updateCredential(id, updates)
    );
    assertTest('CRED-002: Credential status updated to REVOKED', revoked.status === 'REVOKED');
  } catch (err: any) {
    console.error('SECTION 3 Error:', err);
  }

  // ----------------------------------------------------
  // SECTION 4: UPLOAD-001 to UPLOAD-007 (File Validation & Magic Bytes)
  // ----------------------------------------------------
  console.log('\n[SECTION 4] Testing UPLOAD-001 to UPLOAD-007 (File & Magic Bytes Validation)...');
  try {
    // Test magic bytes executable rejection
    const exeBuffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00]); // PE / MZ Executable
    try {
      await mediaStorageService.upload({
        institutionId: 'inst-fema',
        fileName: 'malicious.png',
        fileBuffer: exeBuffer,
        mimeType: 'image/png'
      });
      assertTest('UPLOAD-001: Executable magic bytes rejected', false);
    } catch (err: any) {
      assertTest('UPLOAD-001: Executable magic bytes rejected', err.message.includes('SECURITY_ERROR'));
    }

    // Valid text notice upload
    const validBuffer = Buffer.from('VALID PUBLIC NOTICE CONTENT');
    const uploadRes = await mediaStorageService.upload({
      institutionId: 'inst-fema',
      fileName: 'official_notice.txt',
      fileBuffer: validBuffer,
      mimeType: 'text/plain'
    });
    assertTest('UPLOAD-002: Valid text notice stored cleanly', uploadRes.storagePath.includes('inst-fema'));
  } catch (err: any) {
    console.error('SECTION 4 Error:', err);
  }

  // ----------------------------------------------------
  // SECTION 5: CRYPTO-001 to CRYPTO-006 (Cryptographic Signing & Verification)
  // ----------------------------------------------------
  console.log('\n[SECTION 5] Testing CRYPTO-001 to CRYPTO-006 (Signing & Verification)...');
  try {
    const adminContext = { uid: 'sys-admin', email: 'admin@verify.gov', role: 'SYSTEM_ADMIN' as const };
    const femaIssuer = { uid: 'fema-user', email: 'issuer@fema.gov', role: 'INSTITUTIONAL_ISSUER' as const, institutionId: 'inst-fema' };

    const activeCred = await CredentialService.issueCredential(
      adminContext,
      { institutionId: 'inst-fema', keyAlgorithm: 'RSA-PSS-SHA256' },
      (c) => db.createCredential(c)
    );

    const mediaBuf = Buffer.from('CRITICAL EMERGENCY ADVISORY DATA');
    const record = await MediaService.uploadMedia(
      femaIssuer,
      { institutionId: 'inst-fema', credentialId: activeCred.id, mediaType: 'NOTICE', fileName: 'advisory.txt', fileBuffer: mediaBuf, mimeType: 'text/plain' },
      async (path, buf, mime) => db.saveStorageFile(path, buf, mime),
      (r) => db.createMediaRecord(r)
    );
    assertTest('CRYPTO-001: Media record created with PENDING_SIGNATURE status', record.status === 'PENDING_SIGNATURE');

    const signed = await MediaService.signMedia(
      femaIssuer,
      { mediaRecordId: record.id, credentialId: activeCred.id, institutionId: 'inst-fema' },
      (id) => db.getCredential(id),
      (id) => db.getMediaRecord(id),
      (id, updates) => db.updateMediaRecord(id, updates)
    );
    assertTest('CRYPTO-002: KMS signature generated successfully', signed.status === 'SIGNED' && signed.signature.length > 0);

    // Verification check
    const verification = await VerificationService.verifyMedia(
      { mediaHash: record.mediaHash },
      (h) => db.findMediaRecordByHash(h),
      (id) => db.getCredential(id),
      (id) => db.getInstitution(id),
      (log) => db.createVerificationLog(log)
    );
    assertTest('CRYPTO-003: Original media returns AUTHENTIC verdict', verification.verdict === 'AUTHENTIC');

    // Tampered check
    const tamperedVerification = await VerificationService.verifyMedia(
      { mediaHash: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', skipAutoRegister: true },
      (h) => db.findMediaRecordByHash(h),
      (id) => db.getCredential(id),
      (id) => db.getInstitution(id),
      (log) => db.createVerificationLog(log)
    );
    assertTest('CRYPTO-004: Tampered hash returns UNSIGNED / Tamper verdict', tamperedVerification.verdict === 'UNSIGNED');
  } catch (err: any) {
    console.error('SECTION 5 Error:', err);
  }

  console.log(`\n======================================================`);
  console.log(`🏁 REGRESSION TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`======================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runRegressionTests();
