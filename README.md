# Media Authenticity Verification Platform

A zero-trust cryptographic verification platform and institutional media provenance gateway powered by Firebase Firestore, Cloud Storage, Firebase Cloud Functions v2, Asymmetric KMS Digital Signatures (RSA-PSS / ECDSA), Multimodal AI Forensic Inspection (Google Gemini 2.5 Flash), and Blockchain Provenance Anchoring.

---

## Architecture Overview

```
                                [ CLIENT LAYER ]
          React 19 SPA (Vite 6, Tailwind CSS 4, Lucide Icons, Web Crypto)
          ├── Public Verification Portal (Zero-Auth, Drag-and-Drop, Real-Time Hash)
          ├── Institutional Portal (Role-Gated Upload, KMS Asymmetric Signing)
          ├── Admin Console (Keystore Management, Credential Revocation, Audit Logs)
          └── Architecture & Security Viewer (Cloud Functions & Rule Specifications)
                                       │
                                       ▼ (HTTPS / JSON / Multipart)
                                [ INGRESS LAYER ]
         Express 4.21 Gateway & Live Firebase Functions v2 Triggers
         ├── authMiddleware (Bearer ID Token Verification via Firebase Admin Auth)
         ├── GET  /api/health (System Telemetry & Multi-Service Health)
         ├── GET  /api/verification-logs/stats (Audit Metrics & Verdict Distributions)
         ├── POST /api/media/upload (File Validation, SHA-256 Digest, Bucket Storage)
         ├── POST /api/media/sign (KMS Cryptographic Signing & Blockchain Anchoring)
         ├── POST /api/media/verify (Signature Math, Revocation Check, AI Forensics)
         └── POST /api/credentials/revoke (SYSTEM_ADMIN Keystore Invalidation)
                                       │
                ┌──────────────────────┴──────────────────────┐
                ▼                                             ▼
     [ STORAGE & DATABASE ]                        [ CRYPTO & AI ENGINES ]
  Cloud Firestore (Admin SDK)                   NodeCryptoKMSProvider (GCP KMS Ready)
  ├── institutions (Verified Agencies)          ├── RSA-PSS-SHA256 (2048-bit Private Vault)
  ├── credentials (SPKI Public Keys)            └── ECDSA-P256-SHA256 (Prime256v1 Vault)
  ├── mediaRecords (Manifests & Hashes)         GeminiDeepfakeDetector (Gemini 2.5 Flash)
  └── verificationLogs (Immutable Audit Trail)  └── Multimodal Synthetic Marker Analysis
  Google Cloud Storage Bucket                   BlockchainProvenanceProvider (L2 Provenance)
  └── media/institutions/{id}/{timestamp}-{file}└── Immutable SHA-256 Transaction Anchors
```

---

## Quick Start (Local Development)

### 1. Prerequisites
- Node.js `v20.x` or `v22.x`
- Java Runtime Environment (`v17+` or `v21+` for Firebase Emulators)

### 2. Installation
```bash
# Install root and Cloud Functions dependencies
npm install
npm --prefix functions install
```

### 3. Start Local Development Gateway & Firebase Emulators
```bash
# Start Firebase Firestore and Storage emulators
npx firebase-tools emulators:start --only firestore,storage

# In a separate terminal, start the web server
npm run dev
```

### 4. Run Automated Emulator Regression Tests
```bash
npx firebase-tools emulators:exec --only firestore,storage "npm test"
```

---

## Continuous Integration & Deployment (CI/CD)

The platform is equipped with automated GitHub Actions pipelines:

```
Code Push / Pull Request
         │
         ▼
[ .github/workflows/ci.yml ]
         │
         ├── 1. Setup Node 20 & Java 21
         ├── 2. Install dependencies (npm ci && npm --prefix functions ci)
         ├── 3. Typecheck & Lint (npm run lint)
         ├── 4. Build SPA & Server (npm run build)
         ├── 5. Compile Cloud Functions (npm --prefix functions run build)
         └── 6. Run 42+ Emulator Tests (npx firebase-tools emulators:exec)
         │
         ▼
[ .github/workflows/deploy.yml ] (On main branch merge)
         │
         ├── 1. Authenticate with Google Cloud / Firebase (Workload Identity / Secrets)
         └── 2. Deploy Firestore Rules, Storage Rules, and Cloud Functions v2
```

For full deployment instructions, environment variable setup, and rollback instructions, refer to **[`DEPLOYMENT.md`](DEPLOYMENT.md)**.