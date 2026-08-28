# Media Authenticity Verification Platform — Deployment & CI/CD Guide

This document defines the production deployment architecture, continuous integration (CI) pipeline, environment configuration, and rollback procedures for the Media Authenticity Verification Platform.

---

## 1. Prerequisites

- **Node.js**: `v20.x` or `v22.x` (LTS recommended)
- **Java Runtime Environment (JRE)**: `v17+` or `v21+` (required for local Firebase Emulator Suite execution)
- **Firebase CLI**: `firebase-tools` (`npm install -g firebase-tools` or via `npx firebase-tools`)
- **Google Cloud / Firebase Project**: An active Firebase project with Firestore, Cloud Storage, and Cloud Functions enabled (Blaze plan required for Cloud Functions v2).

---

## 2. Environment & Secrets Configuration

All configuration is managed securely via environment variables and runtime secrets. **Never commit `.env` or service account credential files to git.**

### Required Environment Variables (`.env` / GitHub Repository Secrets)

| Variable / Secret | Description | Target Environment | Required? |
| :--- | :--- | :--- | :---: |
| `FIREBASE_PROJECT_ID` | The ID of your Firebase project (e.g. `media-authenticity-platform`) | Local, CI, Production | **Yes** |
| `FIREBASE_SERVICE_ACCOUNT` | JSON service account credentials with deployment IAM roles | GitHub Secrets (CD) | For Auto Deploy |
| `GEMINI_API_KEY` | Google AI Gemini API Key for multimodal forensic deepfake analysis | Runtime / Secret Manager | Optional (Enclave fallback active) |
| `PORT` | Local server listening port (defaults to `5000` or `3000`) | Server Gateway | No |

---

## 3. Local Development & Emulator Testing

The platform supports 100% offline local development and automated testing using the Firebase Emulator Suite.

### Start Local Emulators & Development Gateway
```bash
# 1. Install root & functions dependencies
npm install
npm --prefix functions install

# 2. Start Firebase Local Emulators (Firestore & Cloud Storage)
npx firebase-tools emulators:start --only firestore,storage

# 3. Start local development server with Vite hot-reloading
npm run dev
```

### Run Automated Regression Test Suite in Emulators
```bash
# Executes 42+ automated regression tests in isolated emulator instances
npx firebase-tools emulators:exec --only firestore,storage "npm test"
```

---

## 4. Production Build Procedure

Before deploying to production, ensure that both the frontend SPA, backend server bundle, and Cloud Functions TypeScript compile without errors:

```bash
# 1. Typecheck and lint codebase
npm run lint

# 2. Build production React 19 SPA & Express server bundle
npm run build

# 3. Compile Cloud Functions v2 TypeScript
npm --prefix functions run build
```

---

## 5. Deployment Procedures

### Method A: Automated GitHub Actions CD Pipeline (Recommended)

1. Navigate to your GitHub repository **Settings** → **Secrets and variables** → **Actions**.
2. Add the following **Repository Secret**:
   - `FIREBASE_SERVICE_ACCOUNT`: Paste the full JSON content of a Google Cloud service account key with the following IAM roles:
     - `Firebase Admin SDK Administrator Service Agent`
     - `Cloud Functions Admin`
     - `Cloud Storage Admin`
     - `Service Account User`
3. Add the following **Repository Variable**:
   - `FIREBASE_PROJECT_ID`: Set to your Firebase Project ID.
4. When changes are merged into the `main` branch, the [`.github/workflows/deploy.yml`](file:///.github/workflows/deploy.yml) workflow will automatically:
   - Run typecheck and linting.
   - Build client and server artifacts.
   - Run full regression tests in emulators.
   - Authenticate and deploy Firestore rules, Cloud Storage rules, and Cloud Functions v2.

### Method B: Manual CLI Deployment

If deploying manually from a secured deployment terminal:

```bash
# 1. Authenticate with Google Cloud / Firebase
npx firebase-tools login

# 2. Select the target Firebase project
npx firebase-tools use <your-firebase-project-id>

# 3. Run validation checks
npm run lint
npm run build
npm --prefix functions run build
npx firebase-tools emulators:exec --only firestore,storage "npm test"

# 4. Deploy all backend components
npx firebase-tools deploy --only firestore:rules,storage,functions
```

---

## 6. Continuous Integration (CI) Workflow

The platform utilizes GitHub Actions for continuous quality assurance on every pull request and push:

- **Workflow File**: [`.github/workflows/ci.yml`](file:///.github/workflows/ci.yml)
- **Execution Triggers**: All pushes to `main`, `dev`, `release/*` and pull requests.
- **Enforced Checks**:
  1. `npm run lint` (0 TypeScript errors)
  2. `npm run build` (Clean Vite & Express compilation)
  3. `npm --prefix functions run build` (Cloud Functions compilation)
  4. `npx firebase-tools emulators:exec --only firestore,storage "npm test"` (Full automated test suite passing)

---

## 7. Health Check & Telemetry Verification

Post-deployment, verify system health by querying the gateway health endpoint:

```bash
curl -X GET https://<your-domain-or-host>/api/health
```

Expected JSON response:
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "services": {
    "firestore": "connected",
    "cloudStorage": "connected",
    "kmsKeystore": "operational",
    "aiForensics": "operational",
    "blockchainProvenance": "active",
    "cloudFunctions": 4
  }
}
```

---

## 8. Backup & Disaster Recovery Runbook

### 1. Cloud Firestore Automated Backup Strategy
In production, schedule daily automated managed exports using Google Cloud Scheduler and Cloud Functions or `gcloud`:

```bash
# 1. Trigger manual Firestore export to secure backup bucket
gcloud firestore export gs://<backup-bucket-name>/exports/$(date +%Y%m%d_%H%M%S) \
  --project <your-firebase-project-id> \
  --collection-ids=institutions,credentials,mediaRecords,verificationLogs

# 2. Restore Firestore from a previous backup snapshot
gcloud firestore import gs://<backup-bucket-name>/exports/<snapshot-timestamp> \
  --project <your-firebase-project-id>
```
*Recommendation*: Retain daily snapshots for 30 days and weekly snapshots for 1 year using Cloud Storage Bucket Object Lifecycle management.

### 2. Cloud Storage Object Versioning & Resilience
Protect verified media assets against accidental overwrites or malicious deletions by enabling Object Versioning:
```bash
# Enable object versioning on institutional media bucket
gcloud storage buckets update gs://<media-bucket-name> --versioning
```

### 3. Recovery Objectives (RTO & RPO)
- **Recovery Time Objective (RTO)**: < 15 minutes (Automated Cloud Run/Functions deployment and keystore revocation)
- **Recovery Point Objective (RPO)**: < 1 hour for Firestore audit logs; 0 data loss for signed cryptographic media manifests via Storage versioning.

### 4. Fast Cloud Functions & Rules Rollback
```bash
# 1. Checkout verified stable git release tag
git checkout tags/v1.0.0-stable

# 2. Re-compile and deploy previous stable Cloud Functions
npm --prefix functions run build
npx firebase-tools deploy --only functions,firestore:rules,storage:rules --project <your-firebase-project-id>
```

---

## 9. Comprehensive Incident Response Playbook

### Incident Category 1: Authentication & Token Compromise
1. Revoke compromised Firebase user session in Firebase Admin Console (`adminAuth.revokeRefreshTokens(uid)`).
2. Rotate API gateway signing secrets and trigger redeployment.
3. Review audit logs in `/api/verification-logs` for unauthorized mutations during the breach window.

### Incident Category 2: Institutional Key Compromise
1. Immediately invoke `/api/credentials/revoke` specifying `credentialId` and revocation reason.
2. Issue a new active keypair for the affected institution (`/api/credentials`).
3. Verification engine instantly triggers revocation cascade; all historical signatures under the compromised key are marked `PROVEN_FAKE`.

### Incident Category 3: Media Alteration / Tampering Incident
1. Query verification telemetry `/api/verification-logs/stats` to identify affected media hashes.
2. Re-verify SHA-256 integrity against immutable Cloud Storage source objects.
3. If forged media was submitted, the zero-trust engine flags the hash as `UNSIGNED` or `PROVEN_FAKE`.

### Incident Category 4: AI Forensics Provider Outage
1. Bounded timeout wrapper (10,000ms) automatically switches verification engine to deterministic enclave mode.
2. Cryptographic signature and Firestore trust chain verification remain 100% authoritative and uninterrupted.
3. Monitor Google GenAI API status and verify fallback notice in application logs.

### Incident Category 5: Cloud Storage Outage
1. Storage requests fail gracefully with HTTP 503 Service Unavailable.
2. Rate limiters and retry backoff prevent client retry storms.
3. Metadata verification remains functional for known SHA-256 hashes queried directly via Firestore.

### Incident Category 6: Firestore Database Outage
1. Probes (`/api/health/ready`) return HTTP 503 degraded status.
2. Automated retry mechanism with exponential backoff and jitter attempts reconnection.
3. If catastrophic, trigger snapshot restore using `gcloud firestore import gs://<backup-bucket>/exports/<latest-snapshot>`.

### Incident Category 7: Blockchain Provider Outage
1. Verification falls back to internal KMS cryptographic signature verification.
2. Offline signing queues transaction hashes for delayed anchoring upon blockchain provider recovery.

### Incident Category 8: Abnormal Verification Traffic / DoS Flood
1. Sliding-window rate limiter automatically triggers HTTP 429 Too Many Requests with `Retry-After: 60`.
2. For multi-instance scaling, activate Google Cloud Armor or Cloudflare rate-limiting per edge location.

---

## 10. Scalability & Single vs. Multi-Instance Architecture

| Component | Development / Single-Instance | Production Multi-Instance (Horizontal Scaling) |
|---|---|---|
| **Rate Limiting** | In-memory sliding window (`rateLimiter.ts`) | Google Cloud Armor / Redis Memorystore cluster |
| **KMS Keystore** | `NodeCryptoKMSProvider` in-memory vault | Google Cloud KMS (`projects/*/locations/*/keyRings/*`) |
| **Database Queries** | Firestore Local Emulator | Multi-region Google Cloud Firestore with composite indexes |
| **Media Storage** | Cloud Storage Emulator bucket | Multi-region Google Cloud Storage with CDN caching |
| **Compute Engines** | Local Node.js Express server | Serverless Cloud Run / Firebase Cloud Functions v2 auto-scaling |
