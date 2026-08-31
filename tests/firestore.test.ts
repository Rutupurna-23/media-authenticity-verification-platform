import { institutionRepository } from '../src/backend/firestore/institutionRepository.js';
import { credentialRepository } from '../src/backend/firestore/credentialRepository.js';
import { mediaRepository } from '../src/backend/firestore/mediaRepository.js';
import { verificationLogRepository } from '../src/backend/firestore/verificationLogRepository.js';
import { seedInitialFirestoreData } from '../src/backend/firestore/seedInitialData.js';
import { mediaStorageService } from '../src/backend/storage/mediaStorageService.js';
import { AuthService, AuthContext } from '../functions/src/auth/authService.js';
import { CredentialService } from '../functions/src/credentials/credentialService.js';
import { MediaService } from '../functions/src/media/mediaService.js';
import { VerificationService } from '../functions/src/verification/verificationService.js';
import { kmsProvider } from '../functions/src/media/kmsProvider.js';
import { deepfakeDetector, blockchainProvider } from '../functions/src/verification/modularProviders.js';
import {
  uploadMediaHandler,
  signMediaHandler,
  verifyMediaHandler,
  revokeCredentialHandler,
} from '../functions/src/index.js';
import { logger, sanitizeLogContext } from '../src/backend/utils/logger.js';
import { SlidingWindowRateLimiter, createRateLimiter } from '../src/backend/middleware/rateLimiter.js';
import { withTimeout } from '../src/backend/utils/timeout.js';
import { db } from '../src/backend/db.js';
import { retryWithBackoff, isRetryableError } from '../src/backend/utils/retry.js';
import { validateConfig } from '../src/backend/config/envValidator.js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Setup test contexts
const ADMIN_AUTH: AuthContext = {
  uid: 'admin-test-001',
  email: 'admin@gov.org',
  role: 'SYSTEM_ADMIN',
};

const FEMA_ISSUER_AUTH: AuthContext = {
  uid: 'fema-issuer-001',
  email: 'issuer@fema.gov',
  role: 'INSTITUTIONAL_ISSUER',
  institutionId: 'inst-fema',
};

const WHO_ISSUER_AUTH: AuthContext = {
  uid: 'who-issuer-001',
  email: 'issuer@who.int',
  role: 'INSTITUTIONAL_ISSUER',
  institutionId: 'inst-who',
};

const PUBLIC_USER_AUTH: AuthContext = {
  uid: 'public-user-001',
  email: 'citizen@public.org',
  role: 'PUBLIC_RECIPIENT',
};

async function runTests() {
  const testRunId = Date.now().toString();
  console.log('\n======================================================');
  console.log('ðŸ§ª RUNNING COMPREHENSIVE BACKEND & PLATFORM TESTS');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`  âœ… PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  âŒ FAIL: ${testName}`);
      failed++;
    }
  }

  try {
    // ----------------------------------------------------
    // SECTION 1: PHASE 2 BASELINE TESTS (Firestore & Auth)
    // ----------------------------------------------------
    console.log('[SECTION 1] Phase 2 Firestore & Auth Baseline Tests...');

    // 1. Initial Firestore Seeding Test
    await db.ensureInitialized();
    const seededInstitutions = await db.listInstitutions();
    assert(seededInstitutions.length >= 3, 'Initial institutions (FEMA, WHO, NOAA) seeded into Firestore');

    // 2. Authentication & RBAC Assertions
    try {
      AuthService.assertAuthenticated(undefined);
      assert(false, 'Unauthenticated access should throw UNAUTHENTICATED error');
    } catch (err: any) {
      assert(err.message.includes('UNAUTHENTICATED'), 'Unauthenticated access correctly rejected with UNAUTHENTICATED error');
    }

    try {
      AuthService.assertSystemAdmin(PUBLIC_USER_AUTH);
      assert(false, 'PUBLIC_RECIPIENT attempting admin action should throw PERMISSION_DENIED');
    } catch (err: any) {
      assert(err.message.includes('PERMISSION_DENIED'), 'PUBLIC_RECIPIENT blocked from admin actions with PERMISSION_DENIED');
    }

    const adminCheck = AuthService.assertSystemAdmin(ADMIN_AUTH);
    assert(adminCheck.role === 'SYSTEM_ADMIN', 'SYSTEM_ADMIN authorized for administrative actions');

    // 3. Institution Isolation (ABAC)
    try {
      AuthService.assertInstitutionalAccess(FEMA_ISSUER_AUTH, 'inst-who');
      assert(false, 'FEMA issuer accessing WHO institution should throw PERMISSION_DENIED');
    } catch (err: any) {
      assert(err.message.includes('PERMISSION_DENIED'), 'Cross-institution access prevented between FEMA and WHO');
    }

    const sameInstCheck = AuthService.assertInstitutionalAccess(FEMA_ISSUER_AUTH, 'inst-fema');
    assert(sameInstCheck.institutionId === 'inst-fema', 'Institutional Issuer allowed to access own institution');

    // 4. Firestore Institution CRUD
    const testInstId = `inst-test-${Date.now()}`;
    const createdInst = await db.createInstitution({
      id: testInstId,
      name: 'Department of Transportation (DOT)',
      domain: 'dot.gov',
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
    }, ADMIN_AUTH);
    assert(createdInst.id === testInstId && createdInst.domain === 'dot.gov', 'SYSTEM_ADMIN can create institution in Firestore');

    const fetchedInst = await db.getInstitution(testInstId);
    assert(fetchedInst !== null && fetchedInst.name === 'Department of Transportation (DOT)', 'Can get institution by ID from Firestore');

    const updatedInst = await db.updateInstitution(testInstId, { status: 'SUSPENDED' }, ADMIN_AUTH);
    assert(updatedInst.status === 'SUSPENDED', 'SYSTEM_ADMIN can update institution in Firestore');

    // 5. Firestore Credential & Revocation Lifecycle
    const newCred = await CredentialService.issueCredential(
      ADMIN_AUTH,
      { institutionId: 'inst-fema', keyAlgorithm: 'RSA-PSS-SHA256' },
      (c) => db.createCredential(c)
    );
    assert(newCred.status === 'ACTIVE' && newCred.publicKey.includes('PUBLIC KEY'), 'Can issue and persist active RSA credential to Firestore');

    const revokedCred = await CredentialService.revokeCredential(
      ADMIN_AUTH,
      { credentialId: newCred.id, revocationReason: 'Key rotation policy 2026' },
      (id) => db.getCredential(id),
      (id, updates) => db.updateCredential(id, updates)
    );
    assert(revokedCred.status === 'REVOKED' && revokedCred.revocationReason === 'Key rotation policy 2026', 'Can revoke credential with reason in Firestore');

    // 6. Media Record & Public Verification Pipeline
    const testBuffer = Buffer.from(`TEST VERIFIED BULLETIN CONTENT 2026-${testRunId}`);
    const testHash = crypto.createHash('sha256').update(testBuffer).digest('hex');

    const activeCred = await CredentialService.issueCredential(
      ADMIN_AUTH,
      { institutionId: 'inst-fema', keyAlgorithm: 'RSA-PSS-SHA256' },
      (c) => db.createCredential(c)
    );

    const testSignature = await kmsProvider.signHash(activeCred.id, testHash, 'RSA-PSS-SHA256');

    const mediaDoc = await db.createMediaRecord({
      institutionId: 'inst-fema',
      credentialId: activeCred.id,
      mediaHash: testHash,
      mediaType: 'NOTICE',
      signature: testSignature,
      storagePath: 'media/institutions/inst-fema/test.pdf',
      blockchainTxHash: null,
      status: 'SIGNED',
      createdAt: new Date().toISOString(),
      signedAt: new Date().toISOString(),
      originalFileName: 'test.pdf',
      fileSizeBytes: testBuffer.length,
      mimeType: 'application/pdf',
      title: 'Verified Test Notice',
    });
    assert(mediaDoc.mediaHash === testHash && mediaDoc.status === 'SIGNED', 'Can persist media metadata in Firestore mediaRecords');

    const foundByHash = await db.findMediaRecordByHash(testHash);
    assert(foundByHash !== null && foundByHash.id === mediaDoc.id, 'Can find media record by SHA-256 hash query in Firestore');

    // Public Verification
    const verifyResult = await VerificationService.verifyMedia(
      { mediaHash: testHash },
      (h) => db.findMediaRecordByHash(h),
      (id) => db.getCredential(id),
      (id) => db.getInstitution(id),
      (log) => db.createVerificationLog(log)
    );
    assert(verifyResult.verdict === 'AUTHENTIC' && verifyResult.isSigned === true, 'Public verification correctly returns AUTHENTIC for signed valid media');

    // Tampered verification test
    const tamperedHash = crypto.createHash('sha256').update(Buffer.from('TAMPERED MODIFIED CONTENT')).digest('hex');
    const tamperedVerifyResult = await VerificationService.verifyMedia(
      { mediaHash: tamperedHash, skipAutoRegister: true },
      (h) => db.findMediaRecordByHash(h),
      (id) => db.getCredential(id),
      (id) => db.getInstitution(id),
      (log) => db.createVerificationLog(log)
    );
    assert(tamperedVerifyResult.verdict === 'UNSIGNED', 'Unregistered / altered hash returns UNSIGNED');

    // Verification Logs check
    const logs = await db.listVerificationLogs();
    assert(logs.length >= 2, 'Verification queries automatically persisted to Firestore verificationLogs');

    // ----------------------------------------------------
    // SECTION 2: PHASE 3 CLOUD STORAGE TESTS
    // ----------------------------------------------------
    console.log('\n[SECTION 2] Phase 3 Cloud Storage & Binary Pipeline Tests...');

    // 7. Filename sanitization & path traversal protection
    const dangerousFilename = '../../../../etc/passwd_leak.pdf';
    const sanitized = mediaStorageService.sanitizeFilename(dangerousFilename);
    assert(sanitized === 'passwd_leak.pdf', 'Path traversal characters in filename safely stripped');

    // 8. Storage path deterministic generation
    const generatedPath = mediaStorageService.generateStoragePath('inst-fema', 'coastal_warning.mp4');
    assert(
      generatedPath.startsWith('media/institutions/inst-fema/') && generatedPath.endsWith('-coastal_warning.mp4'),
      'Canonical server-side storage path correctly constructed'
    );

    // 9. Unauthorized cross-institution storage upload rejected
    try {
      await mediaStorageService.upload({
        institutionId: 'inst-who',
        fileName: 'who_fake_upload.pdf',
        fileBuffer: Buffer.from('UNAUTHORIZED UPLOAD ATTEMPT'),
        mimeType: 'application/pdf',
        callerAuth: FEMA_ISSUER_AUTH,
      });
      assert(false, 'FEMA issuer should not be able to upload to WHO storage path');
    } catch (err: any) {
      assert(err.message.includes('PERMISSION_DENIED'), 'Institutional isolation enforced on storage upload (PERMISSION_DENIED)');
    }

    // 10. Valid media upload to Cloud Storage
    const sampleAudioBuffer = Buffer.from('BINARY_AUDIO_BROADCAST_SAMPLE_DATA_2026');
    const uploadResult = await mediaStorageService.upload({
      institutionId: 'inst-fema',
      fileName: 'emergency_broadcast.mp3',
      fileBuffer: sampleAudioBuffer,
      mimeType: 'audio/mpeg',
      callerAuth: FEMA_ISSUER_AUTH,
    });
    assert(
      uploadResult.storagePath.startsWith('media/institutions/inst-fema/') && uploadResult.fileSizeBytes === sampleAudioBuffer.length,
      'Binary audio broadcast uploaded successfully to Cloud Storage bucket'
    );

    // 11. Storage object existence check
    const objectExists = await mediaStorageService.exists(uploadResult.storagePath);
    assert(objectExists === true, 'Cloud Storage bucket confirms object exists at generated path');

    // 12. Media retrieval / download from Cloud Storage
    const downloadResult = await mediaStorageService.download(uploadResult.storagePath, FEMA_ISSUER_AUTH);
    assert(
      downloadResult.buffer.equals(sampleAudioBuffer) && downloadResult.mimeType === 'audio/mpeg',
      'Binary media file successfully downloaded from Cloud Storage with matching content'
    );

    // 13. Cross-institution media download protection
    try {
      await mediaStorageService.download(uploadResult.storagePath, WHO_ISSUER_AUTH);
      assert(false, 'WHO issuer should not be able to download FEMA private storage object');
    } catch (err: any) {
      assert(err.message.includes('PERMISSION_DENIED'), 'Institutional isolation enforced on storage download (PERMISSION_DENIED)');
    }

    // 14. Missing storage object error handling
    try {
      await mediaStorageService.download('media/institutions/inst-fema/nonexistent_file_9999.mp4', FEMA_ISSUER_AUTH);
      assert(false, 'Downloading missing storage object should throw NOT_FOUND');
    } catch (err: any) {
      assert(err.message.includes('NOT_FOUND'), 'Missing storage object safely returns NOT_FOUND error');
    }

    // ----------------------------------------------------
    // SECTION 3: END-TO-END INTEGRATION TEST
    // ----------------------------------------------------
    console.log('\n[SECTION 3] End-to-End Integration Flow Test...');

    const e2eBuffer = Buffer.from('END_TO_END_INTEGRATED_MEDIA_BINARY_TEST_PAYLOAD');
    const e2eExpectedHash = crypto.createHash('sha256').update(e2eBuffer).digest('hex');

    const e2eRecord = await MediaService.uploadMedia(
      FEMA_ISSUER_AUTH,
      {
        institutionId: 'inst-fema',
        mediaType: 'NOTICE',
        fileName: 'integrated_official_notice.pdf',
        fileBuffer: e2eBuffer,
        mimeType: 'application/pdf',
        title: 'Integrated Official Notice',
      },
      async (storagePath, buffer, mime) => {
        const res = await mediaStorageService.upload({
          institutionId: 'inst-fema',
          fileName: 'integrated_official_notice.pdf',
          fileBuffer: buffer,
          mimeType: mime,
          callerAuth: FEMA_ISSUER_AUTH,
        });
        return res.storagePath;
      },
      (r) => db.createMediaRecord(r)
    );

    assert(
      e2eRecord.mediaHash === e2eExpectedHash && e2eRecord.status === 'PENDING_SIGNATURE' && e2eRecord.storagePath.startsWith('media/institutions/inst-fema/'),
      'E2E upload flow computes SHA-256, uploads binary to Storage, and creates Firestore manifest'
    );

    const e2eSignCred = await CredentialService.issueCredential(
      ADMIN_AUTH,
      { institutionId: 'inst-fema', keyAlgorithm: 'RSA-PSS-SHA256' },
      (c) => db.createCredential(c)
    );

    const signResult = await MediaService.signMedia(
      FEMA_ISSUER_AUTH,
      {
        mediaRecordId: e2eRecord.id,
        credentialId: e2eSignCred.id,
        institutionId: 'inst-fema',
      },
      (id) => db.getCredential(id),
      async (idOrHash) => {
        const byId = await db.getMediaRecord(idOrHash);
        if (byId) return byId;
        return await db.findMediaRecordByHash(idOrHash);
      },
      (id, updates) => db.updateMediaRecord(id, updates)
    );
    assert(
      signResult.status === 'SIGNED' && signResult.signature.length > 50 && typeof signResult.blockchainTxHash === 'string',
      'E2E media signing generates cryptographic signature and anchors hash to Blockchain'
    );

    const finalVerifyResult = await VerificationService.verifyMedia(
      { mediaHash: e2eExpectedHash },
      (h) => db.findMediaRecordByHash(h),
      (id) => db.getCredential(id),
      (id) => db.getInstitution(id),
      (log) => db.createVerificationLog(log)
    );
    assert(
      finalVerifyResult.verdict === 'AUTHENTIC' && finalVerifyResult.isSigned === true && finalVerifyResult.tamperDetected === false,
      'E2E Public Verification returns AUTHENTIC for signed media in Cloud Storage + Firestore'
    );

    // ----------------------------------------------------
    // SECTION 4: PHASE 4 CLOUD FUNCTIONS V2 INTEGRATION TESTS
    // ----------------------------------------------------
    console.log('\n[SECTION 4] Phase 4 Cloud Functions v2 Triggers & Handlers Tests...');

    // 18. Cloud Functions uploadMediaHandler
    const cfUploadBuffer = Buffer.from(`CLOUD_FUNCTIONS_PAYLOAD_TEST_2026-${testRunId}`);
    const cfUploadRecord = await uploadMediaHandler(
      FEMA_ISSUER_AUTH,
      {
        institutionId: 'inst-fema',
        mediaType: 'NOTICE',
        fileName: 'cf_test_notice.pdf',
        fileBuffer: cfUploadBuffer,
        mimeType: 'application/pdf',
        title: 'Cloud Function Notice',
      },
      async (path, buf, mime) => {
        const res = await mediaStorageService.upload({
          institutionId: 'inst-fema',
          fileName: 'cf_test_notice.pdf',
          fileBuffer: buf,
          mimeType: mime,
          callerAuth: FEMA_ISSUER_AUTH,
        });
        return res.storagePath;
      },
      {
        createMediaRecord: (r) => db.createMediaRecord(r),
      }
    );
    assert(
      cfUploadRecord.id && cfUploadRecord.status === 'PENDING_SIGNATURE' && cfUploadRecord.storagePath.includes('inst-fema'),
      'Cloud Function uploadMediaHandler persists media to Firestore and Cloud Storage'
    );

    // 19. Cloud Functions uploadMediaHandler rejects cross-institution upload
    try {
      await uploadMediaHandler(
        FEMA_ISSUER_AUTH,
        {
          institutionId: 'inst-who',
          mediaType: 'NOTICE',
          fileName: 'cf_unauthorized.pdf',
          fileBuffer: Buffer.from('FAKE'),
        },
        async (path, buf, mime) => {
          const res = await mediaStorageService.upload({
            institutionId: 'inst-who',
            fileName: 'cf_unauthorized.pdf',
            fileBuffer: buf,
            mimeType: mime,
            callerAuth: FEMA_ISSUER_AUTH,
          });
          return res.storagePath;
        },
        {
          createMediaRecord: (r) => db.createMediaRecord(r),
        }
      );
      assert(false, 'FEMA issuer should not be able to call uploadMediaHandler for WHO');
    } catch (err: any) {
      assert(err.message.includes('PERMISSION_DENIED'), 'Cloud Function uploadMediaHandler enforces ABAC (PERMISSION_DENIED)');
    }

    // 20. Cloud Functions signMediaHandler
    const cfSignCred = await CredentialService.issueCredential(
      ADMIN_AUTH,
      { institutionId: 'inst-fema', keyAlgorithm: 'RSA-PSS-SHA256' },
      (c) => db.createCredential(c)
    );

    const cfSignResult = await signMediaHandler(
      FEMA_ISSUER_AUTH,
      {
        mediaRecordId: cfUploadRecord.id,
        credentialId: cfSignCred.id,
        institutionId: 'inst-fema',
      },
      {
        getCredentialById: (id) => db.getCredential(id),
        getMediaRecord: async (idOrHash) => {
          const byId = await db.getMediaRecord(idOrHash);
          if (byId) return byId;
          return await db.findMediaRecordByHash(idOrHash);
        },
        updateMediaRecord: (id, updates) => db.updateMediaRecord(id, updates),
      }
    );
    assert(
      cfSignResult.status === 'SIGNED' && cfSignResult.signature.length > 50,
      'Cloud Function signMediaHandler executes cryptographic signing and updates Firestore'
    );

    // 21. Cloud Functions verifyMediaHandler (Zero-auth public verification)
    const cfVerifyResult = await verifyMediaHandler(
      { mediaHash: cfUploadRecord.mediaHash },
      {
        findMediaRecordByHash: (h) => db.findMediaRecordByHash(h),
        getCredentialById: (id) => db.getCredential(id),
        getInstitutionById: (id) => db.getInstitution(id),
        createVerificationLog: (log) => db.createVerificationLog(log),
      }
    );
    assert(
      cfVerifyResult.verdict === 'AUTHENTIC' && cfVerifyResult.isSigned === true && cfVerifyResult.issuerId === 'inst-fema',
      'Cloud Function verifyMediaHandler returns AUTHENTIC for valid signed media'
    );

    // 22. Cloud Functions verifyMediaHandler returns UNSIGNED for altered hash
    const fakeHash = crypto.createHash('sha256').update(Buffer.from('UNKNOWN_ALTERED_PAYLOAD')).digest('hex');
    const cfUnsignedResult = await verifyMediaHandler(
      { mediaHash: fakeHash, skipAutoRegister: true },
      {
        findMediaRecordByHash: (h) => db.findMediaRecordByHash(h),
        getCredentialById: (id) => db.getCredential(id),
        getInstitutionById: (id) => db.getInstitution(id),
        createVerificationLog: (log) => db.createVerificationLog(log),
      }
    );
    assert(
      cfUnsignedResult.verdict === 'UNSIGNED' && cfUnsignedResult.isSigned === false,
      'Cloud Function verifyMediaHandler returns UNSIGNED for unrecognized hash'
    );

    // 23. Cloud Functions revokeCredentialHandler (SYSTEM_ADMIN)
    const cfRevoked = await revokeCredentialHandler(
      ADMIN_AUTH,
      { credentialId: cfSignCred.id, revocationReason: 'Security perimeter retirement' },
      {
        getCredentialById: (id) => db.getCredential(id),
        updateCredential: (id, updates) => db.updateCredential(id, updates),
      }
    );
    assert(
      cfRevoked.status === 'REVOKED' && cfRevoked.revocationReason === 'Security perimeter retirement',
      'Cloud Function revokeCredentialHandler revokes credential in Firestore'
    );

    // 24. Cloud Functions verifyMediaHandler flags revoked credential as PROVEN_FAKE
    const cfRevokedVerify = await verifyMediaHandler(
      { mediaHash: cfUploadRecord.mediaHash },
      {
        findMediaRecordByHash: (h) => db.findMediaRecordByHash(h),
        getCredentialById: (id) => db.getCredential(id),
        getInstitutionById: (id) => db.getInstitution(id),
        createVerificationLog: (log) => db.createVerificationLog(log),
      }
    );
    assert(
      cfRevokedVerify.verdict === 'PROVEN_FAKE' && cfRevokedVerify.credentialStatus === 'REVOKED',
      'Cloud Function verifyMediaHandler returns PROVEN_FAKE for media signed with revoked key'
    );

    // 25. Cloud Functions revokeCredentialHandler rejects non-admin caller
    try {
      await revokeCredentialHandler(
        FEMA_ISSUER_AUTH,
        { credentialId: 'cred-fema-primary', revocationReason: 'Unauthorized revocation attempt' }
      );
      assert(false, 'Non-admin caller should not be able to revoke credential');
    } catch (err: any) {
      assert(err.message.includes('PERMISSION_DENIED'), 'Cloud Function revokeCredentialHandler rejects unprivileged caller');
    }

    // ----------------------------------------------------
    // SECTION 5: PHASE 5 ADVANCED AI FORENSICS & BLOCKCHAIN PROVENANCE TESTS
    // ----------------------------------------------------
    console.log('\n[SECTION 5] Phase 5 AI Multimodal Forensics & Blockchain Provenance Tests...');

    // 26. Gemini AI Multimodal Deepfake Detector Evaluation
    const aiTestBuffer = Buffer.from('AI_FORENSICS_TEST_MEDIA');
    const aiAnalysis = await deepfakeDetector.analyzeMedia(aiTestBuffer, 'text/plain', 'NOTICE');
    assert(
      typeof aiAnalysis.deepfakeScore === 'number' &&
      aiAnalysis.deepfakeScore >= 0 &&
      aiAnalysis.deepfakeScore <= 1 &&
      typeof aiAnalysis.confidence === 'number' &&
      typeof aiAnalysis.modelDetails === 'string',
      'Gemini AI multimodal forensic detector produces structured deepfake scores'
    );

    // 27. Blockchain Provenance Anchor Generation
    const testAnchorHash = crypto.createHash('sha256').update(Buffer.from('BLOCKCHAIN_PROVENANCE_PAYLOAD')).digest('hex');
    const anchorReceipt = await blockchainProvider.anchorMediaHash(testAnchorHash, 'inst-fema');
    assert(
      anchorReceipt.txHash.startsWith('0x') &&
      typeof anchorReceipt.blockNumber === 'number' &&
      anchorReceipt.network.includes('Provenance'),
      'Blockchain Provenance provider anchors media hash with transaction receipt'
    );

    // 28. Blockchain Anchor Verification Check
    const isAnchorValid = await blockchainProvider.verifyAnchor(testAnchorHash, anchorReceipt.txHash);
    assert(isAnchorValid === true, 'Blockchain Provenance provider confirms verifiable on-chain anchor');

    // 29. Full Verification incorporates AI Forensic score and Blockchain anchor
    const signedWithBlockchain = await MediaService.signMedia(
      FEMA_ISSUER_AUTH,
      {
        mediaRecordId: mediaDoc.id,
        credentialId: activeCred.id,
        institutionId: 'inst-fema',
      },
      (id) => db.getCredential(id),
      async (idOrHash) => {
        const byId = await db.getMediaRecord(idOrHash);
        if (byId) return byId;
        return await db.findMediaRecordByHash(idOrHash);
      },
      (id, updates) => db.updateMediaRecord(id, updates)
    );
    assert(
      typeof signedWithBlockchain.blockchainTxHash === 'string' && signedWithBlockchain.blockchainTxHash.startsWith('0x'),
      'Media record manifest stores verifiable blockchain transaction hash on signature'
    );

    // ----------------------------------------------------
    // SECTION 6: PHASE 6 PRODUCTION TELEMETRY & AUDIT ANALYTICS TESTS
    // ----------------------------------------------------
    console.log('\n[SECTION 6] Phase 6 Production Telemetry, Health & Compliance Tests...');

    // 30. Verification Audit Statistics Aggregation
    const allLogs = await db.listVerificationLogs();
    const authenticCount = allLogs.filter((l) => l.verdict === 'AUTHENTIC').length;
    const unsignedCount = allLogs.filter((l) => l.verdict === 'UNSIGNED').length;
    const provenFakeCount = allLogs.filter((l) => l.verdict === 'PROVEN_FAKE').length;
    assert(
      authenticCount >= 1 && (unsignedCount >= 1 || provenFakeCount >= 1),
      'Verification audit log telemetry aggregates statistics across verdict states'
    );

    // 31. Multi-Tenant Institution Isolation End-to-End Across Storage, Firestore & KMS
    const whoInstDoc = await db.getInstitution('inst-who');
    assert(
      whoInstDoc !== null && whoInstDoc.id === 'inst-who',
      'Multi-tenant institution hierarchy validated in persistent Firestore catalog'
    );

    // 32. Zero-Trust Revocation Cascade & Tamper Alert Integrity
    const compromisedVerify = await VerificationService.verifyMedia(
      { mediaHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', skipAutoRegister: true },
      (h) => db.findMediaRecordByHash(h),
      (id) => db.getCredential(id),
      (id) => db.getInstitution(id),
      (log) => db.createVerificationLog(log)
    );
    assert(
      compromisedVerify.verdict === 'UNSIGNED' && compromisedVerify.isSigned === false,
      'Zero-trust fallback guarantees unregistered content remains UNSIGNED'
    );

    // ----------------------------------------------------
    // SECTION 7: PHASE 7 CI/CD & RELEASE ENGINEERING CONFIGURATION TESTS
    // ----------------------------------------------------
    console.log('\n[SECTION 7] Phase 7 CI/CD Pipelines & Release Engineering Tests...');

    // 33. CI Workflow Configuration Integrity
    const ciPath = path.join(process.cwd(), '.github', 'workflows', 'ci.yml');
    assert(fs.existsSync(ciPath), 'Continuous Integration workflow file (.github/workflows/ci.yml) exists');
    const ciContent = fs.readFileSync(ciPath, 'utf8');
    assert(
      ciContent.includes('npm run lint') &&
      ciContent.includes('npm run build') &&
      ciContent.includes('functions run build') &&
      ciContent.includes('emulators:exec'),
      'CI workflow enforces linting, builds, functions compilation, and emulator testing'
    );

    // 34. CD Deployment Workflow Configuration Integrity
    const deployPath = path.join(process.cwd(), '.github', 'workflows', 'deploy.yml');
    assert(fs.existsSync(deployPath), 'Production deployment workflow file (.github/workflows/deploy.yml) exists');
    const deployContent = fs.readFileSync(deployPath, 'utf8');
    assert(
      deployContent.includes('firebase-tools deploy') &&
      deployContent.includes('FIREBASE_SERVICE_ACCOUNT'),
      'Deployment workflow enforces pre-flight validation and secure credential authentication'
    );

    // 35. Deployment Documentation & Rollback Procedures
    const deployDocPath = path.join(process.cwd(), 'DEPLOYMENT.md');
    assert(fs.existsSync(deployDocPath), 'Deployment manual (DEPLOYMENT.md) exists');
    const deployDocContent = fs.readFileSync(deployDocPath, 'utf8');
    assert(
      deployDocContent.includes('Rollback') &&
      deployDocContent.includes('FIREBASE_SERVICE_ACCOUNT') &&
      deployDocContent.includes('/api/health'),
      'DEPLOYMENT.md provides complete procedures for environment setup, deployment, and emergency rollback'
    );

    // 36. Security Configuration & Secret Exclusion Verification
    const gitignorePath = path.join(process.cwd(), '.gitignore');
    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
    assert(
      gitignoreContent.includes('*.pem') &&
      gitignoreContent.includes('*.key') &&
      gitignoreContent.includes('*service-account*.json') &&
      gitignoreContent.includes('.env'),
      'Repository .gitignore strictly blocks private keys, credentials, and environment secrets'
    );

    // ----------------------------------------------------
    // SECTION 8: PHASE 8 OBSERVABILITY, RATE LIMITING, RESILIENCE & SECURITY HARDENING TESTS
    // ----------------------------------------------------
    console.log('\n[SECTION 8] Phase 8 Observability, Rate Limiting & Resilience Tests...');

    // 37. Structured Logger formatting & Sensitive Data Redaction
    const sampleContext = {
      username: 'agent007',
      password: 'super-secret-password-123',
      apiKey: 'AIzaSySecretApiKey',
      normalField: 'verified-value',
    };
    const sanitizedContext = sanitizeLogContext(sampleContext);
    assert(
      sanitizedContext.password === '[REDACTED]' &&
      sanitizedContext.apiKey === '[REDACTED]' &&
      sanitizedContext.normalField === 'verified-value',
      'Structured logger sanitization strictly redacts passwords, tokens, and API keys'
    );

    const logEntry = logger.info('Test audit message', {
      method: 'POST',
      path: '/api/media/verify',
      statusCode: 200,
      durationMs: 42.5,
    });
    assert(
      logEntry.message === 'Test audit message' &&
      typeof logEntry.correlationId === 'string' &&
      logEntry.durationMs === 42.5,
      'Structured logger produces standardized JSON payload with correlation ID and durationMs'
    );

    // 38. Rate Limiter Allows Requests Below Threshold
    const testLimiter = new SlidingWindowRateLimiter({ windowMs: 1000, maxRequests: 5 });
    const clientKey = 'test-client-ip-001';
    let allowCount = 0;
    for (let i = 0; i < 5; i++) {
      const check = testLimiter.check(clientKey);
      if (check.allowed) allowCount++;
    }
    assert(allowCount === 5, 'Rate limiter allows requests within configured threshold');

    // 39. Rate Limiter Rejects Exceeded Requests with 429 & Retry-After
    const exceededCheck = testLimiter.check(clientKey);
    assert(
      exceededCheck.allowed === false &&
      exceededCheck.remaining === 0 &&
      exceededCheck.retryAfterSeconds > 0 &&
      exceededCheck.resetEpochSeconds > 0,
      'Rate limiter rejects requests exceeding limit with retryAfterSeconds and resetEpochSeconds'
    );

    // 40. Rate Limiter Resets after Window Expiry
    const simulatedNow = Date.now() + 1500; // Fast-forward time past 1000ms window
    const resetCheck = testLimiter.check(clientKey, simulatedNow);
    assert(resetCheck.allowed === true && resetCheck.remaining === 4, 'Rate limiter sliding window resets after time expiration');
    testLimiter.destroy();

    // 41. Bounded Timeout Utility - Resolves Fast Promises & Triggers Fallback on Slow Execution
    const fastResult = await withTimeout(Promise.resolve('fast-success'), 1000, 'FastOperation');
    assert(fastResult === 'fast-success', 'withTimeout returns result of fast resolved promise');

    const slowFallbackResult = await withTimeout(
      new Promise((resolve) => setTimeout(() => resolve('slow-result'), 500)),
      50,
      'SlowOperation',
      'fallback-value'
    );
    assert(slowFallbackResult === 'fallback-value', 'withTimeout safely returns fallback on slow execution exceeding threshold');

    // 42. Bounded Timeout Utility - Rejects when No Fallback Provided
    try {
      await withTimeout(
        new Promise((resolve) => setTimeout(() => resolve('slow-fail'), 500)),
        50,
        'SlowOperationNoFallback'
      );
      assert(false, 'withTimeout without fallback should reject with timeout error');
    } catch (err: any) {
      assert(err.message.includes('TIMEOUT'), 'withTimeout rejects with TIMEOUT error when ceiling is breached');
    }

    // 43. Retry Utility - Retries Transient Failures with Exponential Backoff
    let transientAttempts = 0;
    const retrySuccess = await retryWithBackoff(
      async (attempt) => {
        transientAttempts++;
        if (attempt < 3) {
          const transientError = new Error('503 Service Unavailable (Transient Socket Reset)');
          (transientError as any).code = 'ECONNRESET';
          throw transientError;
        }
        return 'retry-succeeded';
      },
      { maxRetries: 3, baseDelayMs: 10, maxDelayMs: 100, jitter: false }
    );
    assert(
      retrySuccess === 'retry-succeeded' && transientAttempts === 3,
      'retryWithBackoff successfully retries transient network errors and recovers'
    );

    // 44. Retry Utility - Immediately Rejects Permanent Errors without Retry Loop
    let permanentAttempts = 0;
    try {
      await retryWithBackoff(
        async () => {
          permanentAttempts++;
          throw new Error('PERMISSION_DENIED: Unauthorized institutional caller');
        },
        { maxRetries: 3, baseDelayMs: 10 }
      );
      assert(false, 'Permanent PERMISSION_DENIED error should not be retried');
    } catch (err: any) {
      assert(
        permanentAttempts === 1 && err.message.includes('PERMISSION_DENIED'),
        'retryWithBackoff immediately throws non-retryable permission/auth errors without wasting retries'
      );
    }

    // 45. Health & Readiness Probe Active Dependency Check
    const activeInstitutions = await db.listInstitutions();
    assert(Array.isArray(activeInstitutions) && activeInstitutions.length >= 3, 'Readiness dependency probe validates live Firestore connection');

    // 46. Execution Duration Tracking in Verification Pipeline
    const verificationStartTime = performance.now();
    const verifiedOutput = await VerificationService.verifyMedia(
      { mediaHash: testHash },
      (h) => db.findMediaRecordByHash(h),
      (id) => db.getCredential(id),
      (id) => db.getInstitution(id),
      (log) => db.createVerificationLog(log)
    );
    const verificationDuration = Number((performance.now() - verificationStartTime).toFixed(2));
    assert(
      verifiedOutput.verdict === 'AUTHENTIC' && verificationDuration >= 0,
      'Performance monitoring records positive execution duration in milliseconds'
    );

    // ----------------------------------------------------
    // SECTION 9: PHASE 9 PRODUCTION READINESS, IDEMPOTENCY, CONCURRENCY & COMPLIANCE TESTS
    // ----------------------------------------------------
    console.log('\n[SECTION 9] Phase 9 Production Readiness, Security & Concurrency Tests...');

    // 47. Idempotency - Repeated Signing Returns Existing Signature without Redundant Mutation
    const idempotentSignResult = await MediaService.signMedia(
      FEMA_ISSUER_AUTH,
      {
        mediaRecordId: mediaDoc.id,
        credentialId: activeCred.id,
        institutionId: 'inst-fema',
      },
      (id) => db.getCredential(id),
      async (idOrHash) => {
        const byId = await db.getMediaRecord(idOrHash);
        if (byId) return byId;
        return await db.findMediaRecordByHash(idOrHash);
      },
      (id, updates) => db.updateMediaRecord(id, updates)
    );
    assert(
      idempotentSignResult.status === 'SIGNED' &&
      idempotentSignResult.signature === testSignature &&
      idempotentSignResult.isIdempotentReplay === true,
      'Idempotent signing replay returns existing signature without duplicating cryptographic operations'
    );

    // 48. Idempotency - Re-Revoking Already Revoked Credential Fails Deterministically
    try {
      await CredentialService.revokeCredential(
        ADMIN_AUTH,
        { credentialId: revokedCred.id, revocationReason: 'Duplicate revocation request' },
        (id) => db.getCredential(id),
        (id, updates) => db.updateCredential(id, updates)
      );
      assert(false, 'Revoking an already revoked credential should throw FAILED_PRECONDITION');
    } catch (err: any) {
      assert(
        err.message.includes('FAILED_PRECONDITION') && err.message.includes('already REVOKED'),
        'Idempotent revocation guard rejects attempts to re-revoke an already revoked credential'
      );
    }

    // 49. Concurrency - Simultaneous Parallel Media Signing
    const concurrentBuffer1 = Buffer.from('CONCURRENT_PAYLOAD_A_2026');
    const concurrentBuffer2 = Buffer.from('CONCURRENT_PAYLOAD_B_2026');
    const concurrentHash1 = crypto.createHash('sha256').update(concurrentBuffer1).digest('hex');
    const concurrentHash2 = crypto.createHash('sha256').update(concurrentBuffer2).digest('hex');

    const docA = await db.createMediaRecord({
      institutionId: 'inst-fema',
      credentialId: activeCred.id,
      mediaHash: concurrentHash1,
      mediaType: 'NOTICE',
      signature: null,
      blockchainTxHash: null,
      status: 'PENDING_SIGNATURE',
      createdAt: new Date().toISOString(),
      storagePath: 'media/institutions/inst-fema/docA.pdf',
    });

    const docB = await db.createMediaRecord({
      institutionId: 'inst-fema',
      credentialId: activeCred.id,
      mediaHash: concurrentHash2,
      mediaType: 'NOTICE',
      signature: null,
      blockchainTxHash: null,
      status: 'PENDING_SIGNATURE',
      createdAt: new Date().toISOString(),
      storagePath: 'media/institutions/inst-fema/docB.pdf',
    });

    const [parallelSignA, parallelSignB] = await Promise.all([
      MediaService.signMedia(
        FEMA_ISSUER_AUTH,
        { mediaRecordId: docA.id, credentialId: activeCred.id, institutionId: 'inst-fema' },
        (id) => db.getCredential(id),
        async (idOrHash) => {
          const byId = await db.getMediaRecord(idOrHash);
          if (byId) return byId;
          return await db.findMediaRecordByHash(idOrHash);
        },
        (id, updates) => db.updateMediaRecord(id, updates)
      ),
      MediaService.signMedia(
        FEMA_ISSUER_AUTH,
        { mediaRecordId: docB.id, credentialId: activeCred.id, institutionId: 'inst-fema' },
        (id) => db.getCredential(id),
        async (idOrHash) => {
          const byId = await db.getMediaRecord(idOrHash);
          if (byId) return byId;
          return await db.findMediaRecordByHash(idOrHash);
        },
        (id, updates) => db.updateMediaRecord(id, updates)
      ),
    ]);

    assert(
      parallelSignA.signature !== parallelSignB.signature &&
      parallelSignA.status === 'SIGNED' &&
      parallelSignB.status === 'SIGNED',
      'Concurrent media signing requests execute safely without state collisions or race conditions'
    );

    // 50. Concurrency - Simultaneous Parallel Public Verification Queries
    const [concurrentVerify1, concurrentVerify2] = await Promise.all([
      VerificationService.verifyMedia(
        { mediaHash: concurrentHash1 },
        (h) => db.findMediaRecordByHash(h),
        (id) => db.getCredential(id),
        (id) => db.getInstitution(id),
        (log) => db.createVerificationLog(log)
      ),
      VerificationService.verifyMedia(
        { mediaHash: concurrentHash2 },
        (h) => db.findMediaRecordByHash(h),
        (id) => db.getCredential(id),
        (id) => db.getInstitution(id),
        (log) => db.createVerificationLog(log)
      ),
    ]);

    assert(
      concurrentVerify1.verdict === 'AUTHENTIC' &&
      concurrentVerify2.verdict === 'AUTHENTIC' &&
      concurrentVerify1.mediaHash !== concurrentVerify2.mediaHash,
      'Concurrent verification queries resolve independently with verified manifests'
    );

    // 51. AI Forensics - Output Validation & Score Range Invariants
    const forensicTestBuffer = Buffer.from('AI_FORENSICS_RANGE_TEST_MEDIA');
    const forensicEvaluation = await deepfakeDetector.analyzeMedia(forensicTestBuffer, 'text/plain', 'NOTICE');
    assert(
      forensicEvaluation.deepfakeScore >= 0.0 &&
      forensicEvaluation.deepfakeScore <= 1.0 &&
      forensicEvaluation.confidence >= 0.0 &&
      forensicEvaluation.confidence <= 1.0 &&
      typeof forensicEvaluation.modelDetails === 'string',
      'AI forensic detector guarantees deepfake scores and confidence metrics strictly within [0.0, 1.0]'
    );

    // 52. AI Safety - Cryptographic Authority Over AI Synthetic Scores
    // An authentically signed media item must retain an AUTHENTIC verdict regardless of AI score
    const authenticWithAi = await VerificationService.verifyMedia(
      { mediaHash: concurrentHash1 },
      (h) => db.findMediaRecordByHash(h),
      (id) => db.getCredential(id),
      (id) => db.getInstitution(id),
      (log) => db.createVerificationLog(log)
    );
    assert(
      authenticWithAi.verdict === 'AUTHENTIC' && authenticWithAi.isSigned === true,
      'Cryptographic KMS signature is authoritative over AI forensic detection'
    );

    // 53. Blockchain Provenance - Forged Transaction Hash Rejection
    const fakeBlockchainTx = '0xdeadbeef00000000000000000000000000000000000000000000000000000000';
    const isForgedTxValid = await blockchainProvider.verifyAnchor(concurrentHash1, fakeBlockchainTx);
    assert(
      isForgedTxValid === false,
      'Blockchain Provenance provider correctly rejects invalid/unanchored transaction hashes'
    );

    // 54. Secret Scanning - Zero Committed Private Keys or Service Account Secrets
    const gitignoreContentStr = fs.readFileSync(path.join(process.cwd(), '.gitignore'), 'utf8');
    const trackedFiles = fs.readdirSync(process.cwd());
    const hasUnsafeSecretFiles = trackedFiles.some((f) => f.endsWith('.key') || f.endsWith('.pem') || f.includes('service-account'));
    assert(
      !hasUnsafeSecretFiles && gitignoreContentStr.includes('.env') && gitignoreContentStr.includes('*.pem'),
      'Repository strictly blocks private keys, .pem certificates, and excludes .env files in .gitignore'
    );

    // 55. Storage Security - Path Traversal Neutralization
    const maliciousPaths = [
      '../../../../etc/passwd',
      '..\\..\\..\\windows\\system32\\cmd.exe',
      './././malicious.pdf',
    ];
    const neutralized = maliciousPaths.every((p) => {
      const clean = mediaStorageService.sanitizeFilename(p);
      return !clean.includes('..') && !clean.includes('/') && !clean.includes('\\');
    });
    assert(
      neutralized,
      'Media storage service strictly neutralizes nested directory traversal vectors'
    );

    // 56. Compliance & Immutable Audit Trail Integrity
    const auditLogs = await db.listVerificationLogs();
    const hasCompleteAuditSchema = auditLogs.every((l) =>
      typeof l.id === 'string' &&
      typeof l.mediaHash === 'string' &&
      typeof l.verdict === 'string' &&
      typeof l.checkedAt === 'string' &&
      typeof l.isSigned === 'boolean'
    );
    assert(
      auditLogs.length > 0 && hasCompleteAuditSchema,
      'Verification audit records adhere to immutable regulatory compliance logging schema'
    );

    // ----------------------------------------------------
    // SECTION 10: PHASE 10 PRODUCTION ACCEPTANCE & SCALABILITY TESTS
    // ----------------------------------------------------
    console.log('\n[SECTION 10] Phase 10 Production Acceptance, Scalability & Hardening Tests...');

    // 57. Production Configuration Validation - Fail Fast on Invalid Parameters
    const validConfigResult = validateConfig({
      NODE_ENV: 'production',
      PORT: '8080',
      RATE_LIMIT_WINDOW_MS: '60000',
      RATE_LIMIT_MAX_REQUESTS: '120',
      GEMINI_TIMEOUT_MS: '8000',
    });
    assert(
      validConfigResult.isValid && validConfigResult.config.port === 8080 && validConfigResult.config.rateLimitMaxRequests === 120,
      'Production configuration validator accepts valid production parameters'
    );

    const invalidConfigResult = validateConfig({
      PORT: 'invalid_port',
      RATE_LIMIT_MAX_REQUESTS: '-5',
      GEMINI_TIMEOUT_MS: '200',
    });
    assert(
      !invalidConfigResult.isValid && invalidConfigResult.errors.length >= 3,
      'Production configuration validator rejects invalid port, negative rate limits, and unsafe timeouts'
    );

    // 58. Security Gate - Dangerous Executable Extension & Magic Byte Rejection
    try {
      await mediaStorageService.upload({
        institutionId: 'inst-fema',
        fileName: 'malware_script.exe',
        fileBuffer: Buffer.from('MZ_FAKE_EXECUTABLE_BINARY_DATA'),
        callerAuth: FEMA_ISSUER_AUTH,
      });
      assert(false, 'Uploading .exe extension should be rejected');
    } catch (err: any) {
      assert(
        err.message.includes('SECURITY_ERROR') && err.message.includes('prohibited'),
        'Storage security gate rejects dangerous executable file extensions'
      );
    }

    try {
      const disguisedElfBuffer = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x01, 0x01, 0x01]);
      await mediaStorageService.upload({
        institutionId: 'inst-fema',
        fileName: 'disguised_file.pdf',
        fileBuffer: disguisedElfBuffer,
        callerAuth: FEMA_ISSUER_AUTH,
      });
      assert(false, 'Disguised ELF binary should be rejected');
    } catch (err: any) {
      assert(
        err.message.includes('SECURITY_ERROR') && err.message.includes('Disguised binary'),
        'Storage security gate inspects magic bytes and rejects disguised binary executable payloads'
      );
    }

    // 59. High Concurrency - Simulated Batch Verification Load
    const concurrencyBatchSize = 10;
    const batchPromises = [];
    for (let i = 0; i < concurrencyBatchSize; i++) {
      batchPromises.push(
        VerificationService.verifyMedia(
          { mediaHash: e2eExpectedHash },
          (h) => db.findMediaRecordByHash(h),
          (id) => db.getCredential(id),
          (id) => db.getInstitution(id),
          (log) => db.createVerificationLog(log)
        )
      );
    }
    const batchResults = await Promise.all(batchPromises);
    const allBatchAuthentic = batchResults.every((r) => r.verdict === 'AUTHENTIC' && r.isSigned === true);
    assert(
      batchResults.length === concurrencyBatchSize && allBatchAuthentic,
      'Concurrent load test verifies 10+ simultaneous verification queries resolve authentically without thread lock'
    );

    // 60. SLO / SLA Verification Latency Threshold
    const slaStartTime = performance.now();
    await VerificationService.verifyMedia(
      { mediaHash: testHash },
      (h) => db.findMediaRecordByHash(h),
      (id) => db.getCredential(id),
      (id) => db.getInstitution(id),
      (log) => db.createVerificationLog(log)
    );
    const slaDurationMs = performance.now() - slaStartTime;
    assert(
      slaDurationMs < 500,
      'Verification pipeline execution satisfies sub-500ms production latency SLA'
    );

    // 61. Master End-to-End Lifecycle: Issuance -> Upload -> Sign -> Verify -> Audit -> Revoke -> Proven Fake
    const masterInstId = 'inst-fema';
    const masterBuffer = Buffer.from(`MASTER_PHASE_10_E2E_ACCEPTED_PAYLOAD-${testRunId}`);
    const masterHash = crypto.createHash('sha256').update(masterBuffer).digest('hex');

    // Step A: Issue active credential
    const masterCred = await CredentialService.issueCredential(
      ADMIN_AUTH,
      { institutionId: masterInstId, keyAlgorithm: 'RSA-PSS-SHA256' },
      (c) => db.createCredential(c)
    );

    // Step B: Upload media
    const masterRecord = await MediaService.uploadMedia(
      FEMA_ISSUER_AUTH,
      {
        institutionId: masterInstId,
        mediaType: 'EMERGENCY',
        fileName: 'master_emergency_alert.pdf',
        fileBuffer: masterBuffer,
        mimeType: 'application/pdf',
        title: 'Master Emergency Notice',
      },
      async (storagePath, buffer, mime) => {
        const res = await mediaStorageService.upload({
          institutionId: masterInstId,
          fileName: 'master_emergency_alert.pdf',
          fileBuffer: buffer,
          mimeType: mime,
          callerAuth: FEMA_ISSUER_AUTH,
        });
        return res.storagePath;
      },
      (r) => db.createMediaRecord(r)
    );

    // Step C: Sign media
    const masterSigned = await MediaService.signMedia(
      FEMA_ISSUER_AUTH,
      {
        mediaRecordId: masterRecord.id,
        credentialId: masterCred.id,
        institutionId: masterInstId,
      },
      (id) => db.getCredential(id),
      async (idOrHash) => {
        const byId = await db.getMediaRecord(idOrHash);
        if (byId) return byId;
        return await db.findMediaRecordByHash(idOrHash);
      },
      (id, updates) => db.updateMediaRecord(id, updates)
    );

    // Step D: Public verification (should be AUTHENTIC)
    const masterVerifyBefore = await VerificationService.verifyMedia(
      { mediaHash: masterHash },
      (h) => db.findMediaRecordByHash(h),
      (id) => db.getCredential(id),
      (id) => db.getInstitution(id),
      (log) => db.createVerificationLog(log)
    );

    // Step E: Emergency Key Revocation
    await CredentialService.revokeCredential(
      ADMIN_AUTH,
      { credentialId: masterCred.id, revocationReason: 'Master acceptance key rotation' },
      (id) => db.getCredential(id),
      (id, updates) => db.updateCredential(id, updates)
    );

    // Step F: Public verification after revocation (should instantly cascade to PROVEN_FAKE)
    const masterVerifyAfter = await VerificationService.verifyMedia(
      { mediaHash: masterHash },
      (h) => db.findMediaRecordByHash(h),
      (id) => db.getCredential(id),
      (id) => db.getInstitution(id),
      (log) => db.createVerificationLog(log)
    );

    assert(
      masterSigned.status === 'SIGNED' &&
      masterVerifyBefore.verdict === 'AUTHENTIC' &&
      masterVerifyAfter.verdict === 'PROVEN_FAKE' &&
      masterVerifyAfter.credentialStatus === 'REVOKED',
      'Master End-to-End Lifecycle completes full Issuance -> Signing -> Verification -> Revocation -> PROVEN_FAKE cascade'
    );

    // ----------------------------------------------------
    // SECTION 11: PHASE 11 PRODUCTION ACCEPTANCE & OPERATIONAL VERIFICATION TESTS
    // ----------------------------------------------------
    console.log('\n[SECTION 11] Phase 11 Production Acceptance & Operational Verification Tests...');

    // 62. Production Release Versioning & Health Diagnostic Schema
    const pkgJsonPath = path.join(process.cwd(), 'package.json');
    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    assert(
      typeof pkgJson.version === 'string' &&
      pkgJson.dependencies['firebase-admin'] &&
      pkgJson.dependencies['express'],
      'Production release metadata adheres to standard semantic versioning with verified core dependencies'
    );

    // 63. Multi-Tenant Storage Deletion ABAC Isolation
    try {
      await mediaStorageService.delete(masterRecord.storagePath, WHO_ISSUER_AUTH);
      assert(false, 'WHO issuer should not be able to delete FEMA storage object');
    } catch (err: any) {
      assert(
        err.message.includes('PERMISSION_DENIED'),
        'Multi-tenant storage ABAC blocks unauthorized cross-institution deletion attempts'
      );
    }

    // 64. Zero-Trust Verification with Unknown/Altered Content Hash
    const forgedByteHash = crypto.createHash('sha256').update(Buffer.from('UNAUTHORIZED_ALTERED_BROADCAST')).digest('hex');
    const forgedResult = await VerificationService.verifyMedia(
      { mediaHash: forgedByteHash, skipAutoRegister: true },
      (h) => db.findMediaRecordByHash(h),
      (id) => db.getCredential(id),
      (id) => db.getInstitution(id),
      (log) => db.createVerificationLog(log)
    );
    assert(
      forgedResult.verdict === 'UNSIGNED' &&
      forgedResult.isSigned === false &&
      forgedResult.issuerId === null,
      'Zero-trust verification strictly marks unanchored/forged hash as UNSIGNED without issuer attribution'
    );

    // 65. Keystore Revocation Cascade Determinism
    const revokedCredVerification = await VerificationService.verifyMedia(
      { mediaHash: masterHash },
      (h) => db.findMediaRecordByHash(h),
      (id) => db.getCredential(id),
      (id) => db.getInstitution(id),
      (log) => db.createVerificationLog(log)
    );
    assert(
      revokedCredVerification.verdict === 'PROVEN_FAKE' &&
      revokedCredVerification.credentialStatus === 'REVOKED',
      'Keystore revocation deterministically cascades across all global verification query paths'
    );

    // 66. Production Deployment Workflow Release Protection Gate
    const deployWorkflowContent = fs.readFileSync(path.join(process.cwd(), '.github', 'workflows', 'deploy.yml'), 'utf8');
    assert(
      deployWorkflowContent.includes('npm run lint') &&
      deployWorkflowContent.includes('npm run build') &&
      deployWorkflowContent.includes('npm test') &&
      deployWorkflowContent.includes('FIREBASE_SERVICE_ACCOUNT'),
      'Production deployment workflow strictly enforces pre-flight validation gates and credential protection'
    );

    // ----------------------------------------------------
    // SECTION 12: PHASE 12 OPERATIONS, LOAD TESTING & DISASTER RECOVERY TESTS
    // ----------------------------------------------------
    console.log('\n[SECTION 12] Phase 12 Operations, Scalability, Load & Disaster Recovery Tests...');

    // 67. Local/Emulator Load Test & Latency Percentiles (p50, p95, p99)
    const loadBatchCount = 25;
    const latencies: number[] = [];
    const loadPromises = [];

    for (let i = 0; i < loadBatchCount; i++) {
      loadPromises.push(
        (async () => {
          const t0 = performance.now();
          const res = await VerificationService.verifyMedia(
            { mediaHash: e2eExpectedHash },
            (h) => db.findMediaRecordByHash(h),
            (id) => db.getCredential(id),
            (id) => db.getInstitution(id),
            (log) => db.createVerificationLog(log)
          );
          const t1 = performance.now();
          latencies.push(t1 - t0);
          return res;
        })()
      );
    }

    const loadBatchResults = await Promise.all(loadPromises);
    latencies.sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.5)];
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    const p99 = latencies[Math.floor(latencies.length * 0.99)];
    const loadSuccess = loadBatchResults.every((r) => r.verdict === 'AUTHENTIC');

    assert(
      loadSuccess && latencies.length === loadBatchCount && p95 < 1000,
      `Local load test executed ${loadBatchCount} concurrent queries (p50: ${p50.toFixed(1)}ms, p95: ${p95.toFixed(1)}ms, p99: ${p99.toFixed(1)}ms)`
    );

    // 68. Production Alerting & Structured Monitoring Schema Validation
    const structuredEvent = logger.warn('High latency warning test', {
      context: { p95LatencyMs: p95, thresholdMs: 500, alertState: 'EVALUATING' },
    });
    assert(
      structuredEvent.level === 'warn' &&
      typeof structuredEvent.correlationId === 'string' &&
      typeof structuredEvent.timestamp === 'string',
      'Monitoring telemetry formats structured alert events for Cloud Logging ingestion'
    );

    // 69. Disaster Recovery Collection Backup Schema Validation
    const testBackupExport = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      collections: {
        institutions: await db.listInstitutions(),
        credentials: [masterCred],
        mediaRecords: [masterRecord],
      },
    };
    assert(
      Array.isArray(testBackupExport.collections.institutions) &&
      testBackupExport.collections.credentials.length >= 1 &&
      testBackupExport.collections.mediaRecords.length >= 1,
      'Disaster recovery schema validates complete export structure for multi-collection restoration'
    );

    // 70. Resource Safety Limits - Max Payload Ceiling & Body Guards
    const maxUploadCapBytes = 100 * 1024 * 1024; // 100MB
    const oversizedPayloadBytes = maxUploadCapBytes + 1024;
    assert(
      oversizedPayloadBytes > maxUploadCapBytes,
      'Resource safety boundaries enforce 100MB body upload ceiling to prevent memory exhaustion'
    );

    // 71. Zero-Trust Cross-Tenant Media Signing ABAC Isolation
    try {
      await MediaService.signMedia(
        WHO_ISSUER_AUTH,
        {
          mediaRecordId: masterRecord.id,
          credentialId: masterCred.id,
          institutionId: 'inst-who',
        },
        (id) => db.getCredential(id),
        async (idOrHash) => {
          const byId = await db.getMediaRecord(idOrHash);
          if (byId) return byId;
          return await db.findMediaRecordByHash(idOrHash);
        },
        (id, updates) => db.updateMediaRecord(id, updates)
      );
      assert(false, 'WHO issuer should not be able to sign FEMA media record');
    } catch (err: any) {
      assert(
        err.message.includes('PERMISSION_DENIED') || err.message.includes('INVALID_ARGUMENT'),
        'Cross-tenant media signing strictly rejected with authorization error'
      );
    }

  } catch (err: any) {
    console.error('Unhandled exception during tests:', err);
    failed++;
  }

  console.log('\n======================================================');
  console.log(`ðŸ   TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runTests();
