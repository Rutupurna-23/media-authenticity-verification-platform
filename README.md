# 🛡️ TruthSeal — Media Authenticity Verification Platform

TruthSeal is an enterprise-grade, multi-tenant media authenticity verification platform designed for government agencies, emergency response authorities, healthcare organizations, and public news outlets (e.g., FEMA, WHO, NOAA).

The platform safeguards media integrity against deepfakes, unauthorized manipulation, and misinformation using **Cryptographic KMS Digital Signatures (RSA-PSS / ECDSA)**, **Immutable Provenance Logs**, **AI Forensic Analysis**, and **Zero-Exposure Key Management**.

---

## 📐 Architecture Overview

```
                                [ CLIENT TIER ]
          React 19 Single Page Application (Vite 6, Tailwind CSS 4, Lucide Icons)
          ├── Public Verification Portal (Zero-Auth, Drag-and-Drop, Real-Time Hash)
          ├── Institutional Portal (Active Issuing Authority Dashboard & Media Signer)
          ├── Admin Console (Keystore Management, Key Revocation, Audit Logs)
          └── Architecture & Security Viewer (Cloud Functions & Data Flow Diagrams)
                                       │
                                       ▼ (HTTPS / JSON / Multipart)
                                [ INGRESS TIER ]
          Express 4.21 Gateway & Live Firebase Cloud Functions v2 Triggers
          ├── authMiddleware (Bearer ID Token Verification via Firebase Admin Auth)
          ├── rateLimiter (Sliding Window API Rate Protection)
          ├── GET  /api/credentials/active (Session-Derived Issuing Authority)
          ├── POST /api/media/upload (File Validation, SHA-256 Digest, Bucket Storage)
          ├── POST /api/media/sign (KMS Cryptographic Signing & Blockchain Anchoring)
          ├── POST /api/media/verify (Signature Math, Revocation Check, AI Forensics)
          └── POST /api/credentials/revoke (SYSTEM_ADMIN Keystore Invalidation)
                                       │
                ┌──────────────────────┴──────────────────────┐
                ▼                                             ▼
     [ STORAGE & DATABASE ]                        [ CRYPTO & AI ENGINES ]
  Cloud Firestore (Admin SDK)                   NodeCryptoKMSProvider (GCP KMS Ready)
  ├── institutions (Verified Agencies)          ├── RSA-PSS-SHA256 (2048-bit Vault)
  ├── credentials (SPKI Public Keys)            └── ECDSA-P256-SHA256 (Prime256v1 Vault)
  ├── mediaRecords (Manifests & Hashes)         GeminiDeepfakeDetector (Gemini 2.5 Flash)
  └── verificationLogs (Immutable Audit Logs)   └── Multimodal Synthetic Marker Analysis
  Google Cloud Storage Bucket                   BlockchainProvenanceProvider (L2 Provenance)
  └── media/institutions/{id}/{timestamp}-{file}└── Immutable SHA-256 Transaction Anchors
```

---

## 📁 Clean Repository Structure

```
media-authenticity-verification-platform/
├── frontend/                       # React 19 Single Page Application
│   ├── App.tsx                     # Main Router & Global State Controller
│   ├── index.css                   # Core Design System & Tokens
│   ├── components/
│   │   ├── portals/                # Portal Feature Views
│   │   │   ├── InstitutionalPortal.tsx   # Active Issuing Authority Dashboard
│   │   │   ├── PublicVerification.tsx    # Public Verification Interface & Deepfake Inspector
│   │   │   ├── AdminConsole.tsx          # Authority Lifecycle & Key Revocation
│   │   │   └── LoginPage.tsx             # RBAC Authentication & Role Switcher
│   │   └── ui/                     # Shared UI Components
│   │       ├── Navbar.tsx                # Dynamic Header & Tenant Selector
│   │       ├── ArchitectureViewer.tsx    # Interactive Data Flow Viewer
│   │       └── CyberBackground.tsx       # Animated Matrix Background
├── backend/                        # Node.js / Express Application Server
│   ├── db.ts                       # Dual-Mode Database Abstraction (Firestore + InMemoryDB)
│   ├── config/                     # Environment Validator
│   ├── firestore/                  # Firestore Collections & Repositories
│   ├── middleware/                 # Auth & Rate Limiting Middleware
│   ├── storage/                    # Binary Media Storage Service
│   └── backups/                    # Offline Backup Engines & Utilities
├── functions/                      # Firebase Cloud Functions Engine
├── tests/                          # Automated Regression & Test Suites (121 Tests)
├── scripts/
│   ├── prototype-audit.ts          # Master 28-Scenario Prototype Audit Runner
│   └── run-tests.ts                # Dual-Engine Test Harness
├── DOCUMENTATION.md                # Full Architecture Manual & API Specs
├── DEPLOYMENT.md                   # Production Deployment Manual
└── server.ts                       # Express Production Server & Vite SSR Middleware
```

---

## ⚡ Quick Start (Local Development)

### 1. Prerequisites
- Node.js `v20.x` or `v22.x`
- Java Runtime Environment (`v17+` or `v21+` for Firebase Emulators)

### 2. Installation
```bash
# Install root and Cloud Functions dependencies
npm install
npm --prefix functions install
```

### 3. Start Local Development Server
```bash
# Start the local Express server & Vite frontend
npm run dev
# App opens on: http://localhost:3000
```

---

## 🧪 Testing & Audit Verification

```bash
# 1. Run TypeScript Typecheck
npm run lint

# 2. Build Production Bundle
npm run build

# 3. Run 121 Automated Unit & Integration Tests
npm test

# 4. Run 28-Scenario Master Prototype Audit
npx tsx scripts/prototype-audit.ts

# 5. Run Live Firebase Emulator Test Suite
npm run test:emulator
```

---

## 🚀 Continuous Integration & Deployment (CI/CD)

The platform enforces automated GitHub Actions quality gates:

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
         └── 6. Run 121 Automated & Live Emulator Tests (npm test)
         │
         ▼
[ .github/workflows/deploy.yml ] (On main branch merge)
         │
         ├── 1. Authenticate with Google Cloud / Firebase
         └── 2. Deploy Firestore Rules, Storage Rules, and Cloud Functions v2
```

For full technical specifications, API payload schemas, and architecture diagrams, refer to **[`DOCUMENTATION.md`](DOCUMENTATION.md)** and **[`DEPLOYMENT.md`](DEPLOYMENT.md)**.