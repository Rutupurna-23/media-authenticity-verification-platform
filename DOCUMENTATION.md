# 🛡️ TruthSeal — Media Authenticity Verification Platform
## Technical Documentation & Architecture Manual

TruthSeal is an enterprise-grade, multi-tenant media authenticity verification platform designed for government agencies, emergency response authorities, healthcare organizations, and public news outlets (e.g., FEMA, WHO, NOAA).

The platform safeguards media integrity against deepfakes, unauthorized manipulation, and misinformation using **Cryptographic KMS Digital Signatures (RSA-PSS / ECDSA)**, **Immutable Provenance Logs**, **AI Forensic Analysis**, and **Zero-Exposure Key Management**.

---

## 📐 1. System Architecture & Component Hierarchy

### Visual System Architecture

```mermaid
flowchart TD
    subgraph ClientTier["Frontend Tier (React 19 + TypeScript)"]
        UI_Nav["Navbar & Tenant Switcher"]
        P_Inst["Institutional Portal (Issuer)"]
        P_Pub["Public Verification Portal"]
        P_Admin["System Admin Console"]
    end

    subgraph BackendTier["Server Tier (Node.js + Express / Cloud Functions)"]
        AuthM["Auth & RBAC Middleware"]
        RateL["Rate Limiter Middleware"]
        API_Act["GET /api/credentials/active"]
        API_Sign["POST /api/media/sign"]
        API_Ver["POST /api/media/verify"]
        Engine_Ver["Verification Decision Engine"]
        Engine_AI["AI Forensic Detector"]
    end

    subgraph SecurityStorageTier["Security & Persistence Tier"]
        Vault_KMS["KMS Private Key Vault (RSA-PSS / ECDSA)"]
        DB_Firestore["Firestore Provenance Registry"]
        Store_Media["Cloud / Local Binary Storage"]
        Log_Audit["Immutable Audit Log Ledger"]
    end

    UI_Nav --> AuthM
    P_Inst -->|Session Auth| API_Act
    P_Inst -->|Sign Request| API_Sign
    P_Pub -->|Verification Query| API_Ver
    P_Admin -->|Key Revocation| AuthM

    AuthM --> RateL
    API_Act --> DB_Firestore
    API_Sign --> Vault_KMS
    API_Sign --> DB_Firestore
    API_Sign --> Store_Media
    API_Ver --> Engine_Ver
    Engine_Ver --> Engine_AI
    Engine_Ver --> Vault_KMS
    Engine_Ver --> DB_Firestore
    Engine_Ver --> Log_Audit
```

### Directory Structure & Component Organization

```
media-authenticity-verification-platform/
├── frontend/                       # React 19 Single Page Application
│   ├── App.tsx                     # Main Router & Global State Controller
│   ├── index.css                   # Core Design Tokens & Glassmorphism System
│   ├── components/
│   │   ├── portals/                # Portal Feature Views
│   │   │   ├── InstitutionalPortal.tsx   # Active Issuing Authority Dashboard & Media Signer
│   │   │   ├── PublicVerification.tsx    # Public Verification Interface & Deepfake Inspector
│   │   │   ├── AdminConsole.tsx          # Authority Lifecycle, Key Revocation & Audit Logs
│   │   │   └── LoginPage.tsx             # RBAC Authentication & Role Switcher
│   │   └── ui/                     # Shared UI Components
│   │       ├── Navbar.tsx                # Dynamic Header & Tenant Selector
│   │       ├── ArchitectureViewer.tsx    # Interactive Data Flow Diagram
│   │       └── CyberBackground.tsx       # Animated Matrix Background
│   └── services/                   # Frontend API Services
├── backend/                        # Node.js / Express Application Server
│   ├── db.ts                       # Dual-Mode Database Abstraction (Firestore + InMemoryDB)
│   ├── config/
│   │   └── envValidator.ts         # Environment Configuration & Security Validator
│   ├── firestore/                  # Firestore Collections & Repositories
│   │   ├── institutionRepository.ts # Institution CRUD & Metadata
│   │   ├── credentialRepository.ts  # Cryptographic Credential Registry
│   │   ├── mediaRepository.ts       # Media Provenance & SHA-256 Hashes
│   │   ├── verificationLogRepository.ts # Immutable Audit Logs
│   │   └── seedInitialData.ts       # Initial Authority Seeder (FEMA, WHO, NOAA)
│   ├── middleware/
│   │   ├── authMiddleware.ts        # Bearer ID Token Auth & Session Context
│   │   └── rateLimiter.ts           # Sliding Window API Rate Limiter
│   ├── storage/
│   │   └── mediaStorageService.ts   # Binary Media Storage (Cloud Storage + Local)
│   ├── utils/
│   │   ├── logger.ts                # Structured JSON Logger with Secret Redaction
│   │   ├── retry.ts                 # Backoff & Retry Logic
│   │   └── timeout.ts               # Async Timeout Guard
│   └── backups/                     # Offline Backup Engines & Utilities
├── functions/                      # Firebase Cloud Functions Engine
│   └── src/
│       ├── auth/                   # Authentication & Authorization Services
│       ├── credentials/            # Credential Management Services
│       ├── media/                  # KMS Signing & Verification Pipeline
│       └── verification/           # Deepfake & Verification Decision Engine
├── tests/                          # Automated Regression & Test Suites
│   ├── activeAuthority.test.ts     # Active Authority & Tenant Isolation Suite
│   ├── bugfixes.test.ts            # Bug Regression & KMS Lifecycle Suite
│   └── firestore.test.ts           # Full Baseline Platform Suite (88 Tests)
├── scripts/
│   ├── prototype-audit.ts          # Master 28-Scenario Prototype Audit Runner
│   └── run-tests.ts                # Automated Dual-Engine Test Harness
└── server.ts                       # Express Production Server & Vite SSR Middleware
```

---

## 🏛️ 2. Core Security Guarantees & Active Issuing Authority

### Media Signing Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    actor Issuer as Institutional Issuer (FEMA)
    participant UI as Institutional Portal
    participant API as Express API Server
    participant DB as Firestore Registry
    participant KMS as KMS / Key Vault

    Issuer->>UI: Select Media File & Initiate Sign
    UI->>API: GET /api/credentials/active (Session Token)
    API->>DB: Query ACTIVE credential for inst-fema
    DB-->>API: Return cred-fema-primary (RSA-PSS-SHA256)
    API-->>UI: Active Credential Status = ACTIVE

    UI->>API: POST /api/media/sign (Media Buffer & ID)
    API->>API: Compute SHA-256 Hash of Media File
    API->>KMS: Request Cryptographic Signature (Hash + Key ID)
    Note over KMS: Private key never leaves vault
    KMS-->>API: Return RSA-PSS / ECDSA Digital Signature
    API->>DB: Save Media Record & Provenance Manifest
    DB-->>API: Confirmation (Media Record Created)
    API-->>UI: Return Signed Result (Signature + Hash)
    UI-->>Issuer: Display Verified Active Authority Seal
```

### Zero-Exposure KMS Architecture
1. **Private Key Protection**: Private keys are stored strictly inside a protected Key Management Service (KMS) or local secure vault (`NodeCryptoKMSProvider`). Private key bytes are **NEVER** exposed via API responses or frontend payloads.
2. **Dynamic Active Authority Resolution**:
   - Institutional Issuers query `GET /api/credentials/active` to derive their current authorized credential based on authenticated session context.
   - If an institution's active credential is `REVOKED` or `EXPIRED`, signing operations are immediately blocked with HTTP 403 / non-active status errors.
3. **Multi-Tenant Isolation**:
   - Institutional Issuers (e.g. `FEMA`) are strictly isolated to their own tenant scope.
   - `FEMA` cannot issue signatures using `WHO` or `NOAA` credentials, and cross-institution storage deletions are strictly forbidden.

---

## 🔍 3. Verification Decision Engine & Verdicts

### Verification Pipeline Flowchart

```mermaid
flowchart TD
    Start["Public User Uploads Media / SHA-256"] --> Hash["Compute SHA-256 Hash"]
    Hash --> QueryDB{"Is Hash Registered in Firestore?"}

    QueryDB -- "No" --> Unsigned["Verdict: UNSIGNED / UNVERIFIED"]
    QueryDB -- "Yes" --> CheckRevoked{"Is Issuer Credential Active?"}

    CheckRevoked -- "Revoked / Expired" --> ProvenFake["Verdict: PROVEN_FAKE (Revoked Credential)"]
    CheckRevoked -- "Active" --> KMSVerify["Execute KMS Cryptographic Signature Check"]

    KMSVerify --> SigMatch{"Does Signature Match Hash & Public Key?"}
    SigMatch -- "Mismatch / Tampered Bytes" --> ProvenFake
    SigMatch -- "Valid Match" --> DeepfakeCheck["Execute AI Deepfake Forensic Analysis"]

    DeepfakeCheck --> Authentic["Verdict: AUTHENTIC (Zero-Exposure Seal Valid)"]

    Unsigned --> BadgeYellow["Badge: 🟡 Unsigned Media"]
    ProvenFake --> BadgeRed["Badge: 🔴 Proven Fake / Tampered"]
    Authentic --> BadgeGreen["Badge: 🟢 Verified Authentic"]
```

### Verdict Summary Table

| Verdict | Trigger Condition | Display Badge |
| :--- | :--- | :--- |
| **`AUTHENTIC`** | Valid KMS cryptographic signature matching the media SHA-256 hash issued by an `ACTIVE` credential. | 🟢 **Verified Authentic** |
| **`PROVEN_FAKE`** | A media record exists for the hash, but cryptographic signature verification fails (indicating byte-level tampering). | 🔴 **Proven Fake / Tampered** |
| **`UNSIGNED`** | No cryptographic signature is present or media SHA-256 is unanchored in the registry. | 🟡 **Unsigned / Unverified** |

---

## ⚡ 4. REST API Endpoint Reference

### 🔐 Authentication & Session
- `POST /api/auth/login`
  - **Body**: `{ "role": "INSTITUTIONAL_ISSUER", "email": "admin@fema.gov", "institutionId": "inst-fema" }`
  - **Response**: `{ "status": "SUCCESS", "token": "...", "user": { ... } }`

### 🏛️ Credentials & Active Authority
- `GET /api/credentials/active`
  - **Headers**: `Authorization: Bearer <token>` or `x-institution-id: inst-fema`
  - **Response**: `{ "status": "ACTIVE", "credential": { "id": "cred-fema-primary", "algorithm": "RSA-PSS-SHA256", "status": "ACTIVE" } }`

- `POST /api/credentials/revoke` *(System Admin Only)*
  - **Body**: `{ "credentialId": "cred-fema-primary", "reason": "Key compromise rotation" }`
  - **Response**: `{ "status": "REVOKED", "credentialId": "cred-fema-primary" }`

### 📝 Media Signing & Storage
- `POST /api/media/upload`
  - **Multipart**: `file`, `institutionId`
  - **Response**: `{ "mediaId": "med-123", "sha256Hash": "a3f...", "storagePath": "..." }`

- `POST /api/media/sign`
  - **Body**: `{ "mediaId": "med-123", "institutionId": "inst-fema" }`
  - **Response**: `{ "status": "SIGNED", "signature": "3b...", "credentialId": "cred-fema-primary" }`

### 🔍 Public Verification
- `POST /api/media/verify`
  - **Multipart**: `file` or **JSON**: `{ "sha256Hash": "a3f..." }`
  - **Response**: `{ "verdict": "AUTHENTIC", "institution": { "name": "FEMA" }, "deepfakeScore": 0.02, "signatureValid": true }`

---

## 🧪 5. Local Development & Verification Workflows

### Running the Application
```bash
# Start local Express server & Vite frontend
npm run dev
# App opens on: http://localhost:3000
```

### Running Test Suites
```bash
# Run 121 automated backend & platform unit/integration tests
npm test

# Run 28-scenario master prototype audit
npx tsx scripts/prototype-audit.ts

# Run tests against live Firebase Emulators
npm run test:emulator
```

### Building for Production
```bash
# TypeScript Typecheck
npm run lint

# Build Vite frontend & esbuild server bundle
npm run build
```

---

## 🚀 6. Deployment Strategy

- **Vercel**: Deployed via root `vercel.json` and static bundle output in `dist/`.
- **Firebase Hosting & Cloud Functions**: Functions built under `functions/dist/` and deployed via `firebase.json`.
- **GitHub Actions CI/CD**: Workflow [.github/workflows/ci.yml](file:///.github/workflows/ci.yml) enforces typecheck (`npm run lint`), build (`npm run build`), and Firebase emulator tests on every push to `main`.
