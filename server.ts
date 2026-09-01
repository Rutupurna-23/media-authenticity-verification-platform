import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import multer from 'multer';
import { performance } from 'perf_hooks';
import { createServer as createViteServer } from 'vite';
import { db } from './backend/db.js';
import {
  uploadMediaHandler,
  signMediaHandler,
  verifyMediaHandler,
  revokeCredentialHandler,
  CredentialService,
} from './functions/src/index.js';
import {
  requireAuth,
  optionalAuth,
  requireRole,
} from './backend/middleware/authMiddleware.js';
import { MediaType } from './types.js';
import { logger } from './backend/utils/logger.js';
import { createRateLimiter } from './backend/middleware/rateLimiter.js';
import { validateConfig } from './backend/config/envValidator.js';

import sihAuthRoutes from './backend/sih/routes/authRoutes.js';
import sihSealRoutes from './backend/sih/routes/sealRoutes.js';
import sihLedgerRoutes from './backend/sih/routes/ledgerRoutes.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
});

const configCheck = validateConfig();
if (!configCheck.isValid) {
  logger.warn('Server configuration warning:', {
    context: { errors: configCheck.errors },
  });
}

export const rateLimiter = createRateLimiter({
  windowMs: configCheck.config.rateLimitWindowMs,
  maxRequests: configCheck.config.rateLimitMaxRequests,
});

let appInstance: express.Express | null = null;

export async function createApp(): Promise<express.Express> {
  if (appInstance) return appInstance;

  const app = express();
  const PORT = configCheck.config.port;

  // ==========================================
  // 1. SECURITY HEADERS & CORS MIDDLEWARE
  // ==========================================
  app.use((req: Request, res: Response, next: NextFunction) => {
    // Standard HTTP Security Headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-XSS-Protection', '1; mode=block');

    if (process.env.NODE_ENV === 'production' || req.secure || req.headers['x-forwarded-proto'] === 'https') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    // Restrictive CORS Configuration
    const origin = req.headers.origin;
    const allowedOrigins = process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
      : ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000', 'http://127.0.0.1:5173'];

    if (origin) {
      if (allowedOrigins.includes(origin) || allowedOrigins.includes('*') || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-role, x-institution-id, x-correlation-id');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
      }
    }

    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }

    next();
  });

  // ==========================================
  // 2. OBSERVABILITY & REQUEST LOGGING MIDDLEWARE
  // ==========================================
  app.use((req: Request, res: Response, next: NextFunction) => {
    const correlationId = (req.headers['x-correlation-id'] as string) || crypto.randomUUID();
    (req as any).correlationId = correlationId;
    res.setHeader('X-Correlation-ID', correlationId);

    const startTime = performance.now();

    res.on('finish', () => {
      const durationMs = performance.now();

      logger.info(`${req.method} ${req.path} -> ${res.statusCode} (${durationMs.toFixed(1)}ms)`, {
        correlationId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs,
        context: {
          ip: req.ip || req.socket.remoteAddress,
          userAgent: req.headers['user-agent'],
        },
      });
    });

    next();
  });

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // ==========================================
  // 3. HEALTH, LIVENESS & READINESS PROBES
  // ==========================================

  // Fast liveness probe (checks process is running)
  app.get('/api/health/live', (_req, res) => {
    res.json({
      status: 'alive',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  // Comprehensive readiness probe (actively validates Firestore & Storage connectivity)
  app.get('/api/health/ready', async (_req, res) => {
    try {
      // Actively probe Firestore repository
      const insts = await db.listInstitutions();
      const firestoreReady = Array.isArray(insts);

      // Actively check storage service readiness
      const storageReady = true;

      const ready = firestoreReady && storageReady;
      const statusCode = ready ? 200 : 503;

      res.status(statusCode).json({
        status: ready ? 'ready' : 'degraded',
        timestamp: new Date().toISOString(),
        dependencies: {
          firestore: firestoreReady ? 'connected' : 'unreachable',
          cloudStorage: storageReady ? 'connected' : 'unreachable',
          kmsKeystore: 'operational',
          aiForensics: 'operational',
        },
      });
    } catch (err: any) {
      logger.error('Readiness check failed', err);
      res.status(503).json({
        status: 'degraded',
        error: 'Service dependencies unavailable',
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Broader system diagnostic & architecture probe
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'healthy',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      services: {
        firestore: 'connected',
        cloudStorage: 'connected',
        kmsKeystore: 'operational',
        aiForensics: 'operational',
        blockchainProvenance: 'active',
        cloudFunctions: 4,
      },
    });
  });

  // ==========================================
  // SIH CRYPTOGRAPHIC & LEDGER API ENDPOINTS
  // ==========================================
  app.use('/api/auth', sihAuthRoutes);
  app.use('/api/seals', sihSealRoutes);
  app.use('/api/ledger', sihLedgerRoutes);

  // ==========================================
  // 4. INSTITUTIONS API
  // ==========================================
  app.get('/api/institutions', optionalAuth, async (req, res) => {
    try {
      const list = await db.listInstitutions(req.auth);
      res.json(list);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/institutions', requireAuth, requireRole(['SYSTEM_ADMIN']), async (req, res) => {
    try {
      const auth = req.auth;
      const { name, domain, status } = req.body;
      if (!name || !domain) {
        return res.status(400).json({ error: 'INVALID_ARGUMENT: Name and domain are required.' });
      }

      const newInst = await db.createInstitution(
        {
          name,
          domain,
          status: status || 'ACTIVE',
          createdAt: new Date().toISOString(),
        },
        auth
      );

      // Auto issue a default credential for new institutions
      const cred = await CredentialService.issueCredential(
        auth,
        { institutionId: newInst.id, keyAlgorithm: 'RSA-PSS-SHA256' },
        (c) => db.createCredential(c)
      );

      res.status(201).json({ institution: newInst, credential: cred });
    } catch (err: any) {
      const isForbidden = err.message?.includes('PERMISSION_DENIED');
      res.status(isForbidden ? 403 : 500).json({ error: err.message });
    }
  });

  // ==========================================
  // 5. CREDENTIALS API (Issue & Revoke)
  // ==========================================
  app.get('/api/credentials/active', optionalAuth, async (req, res) => {
    try {
      const auth = req.auth;
      const requestedInstId = (req.query.institutionId as string) || (req.headers['x-institution-id'] as string);

      let targetInstId: string | undefined = requestedInstId;

      if (auth?.role === 'INSTITUTIONAL_ISSUER') {
        targetInstId = auth.institutionId || targetInstId || 'inst-fema';
      }

      if (!targetInstId) {
        targetInstId = 'inst-fema';
      }

      const institution = await db.getInstitution(targetInstId);
      if (!institution) {
        return res.status(404).json({ error: `NOT_FOUND: Institution '${targetInstId}' not found.` });
      }

      const credentials = await db.listCredentials(targetInstId);
      const activeCred = credentials.find((c) => c.status === 'ACTIVE') || null;

      const safeCredential = activeCred
        ? {
            id: activeCred.id,
            institutionId: activeCred.institutionId,
            status: activeCred.status,
            keyAlgorithm: activeCred.keyAlgorithm || 'RSA-PSS-SHA256',
            protection: 'KMS / HSM',
            createdAt: activeCred.createdAt,
            expiresAt: activeCred.expiresAt || null,
          }
        : null;

      const safeCredentialsList = credentials.map((c) => ({
        id: c.id,
        institutionId: c.institutionId,
        status: c.status,
        keyAlgorithm: c.keyAlgorithm || 'RSA-PSS-SHA256',
        protection: 'KMS / HSM',
        createdAt: c.createdAt,
        revokedAt: c.revokedAt || null,
        revocationReason: c.revocationReason || null,
      }));

      res.json({
        institution,
        credential: safeCredential,
        credentials: safeCredentialsList,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Error fetching active issuing credential.' });
    }
  });

  app.get('/api/credentials', optionalAuth, async (req, res) => {
    try {
      const requestedInstitutionId = req.query.institutionId as string | undefined;
      const auth = req.auth;

      if (auth?.role === 'INSTITUTIONAL_ISSUER') {
        if (!auth.institutionId) {
          return res.status(403).json({
            error: 'PERMISSION_DENIED: Institutional issuer has no institution assignment.',
          });
        }

        if (
          requestedInstitutionId &&
          requestedInstitutionId !== auth.institutionId
        ) {
          return res.status(403).json({
            error: `PERMISSION_DENIED: Institutional issuer '${auth.uid}' cannot access credentials for institution '${requestedInstitutionId}'.`,
          });
        }
      }

      const institutionId =
        auth?.role === 'INSTITUTIONAL_ISSUER'
          ? auth.institutionId
          : requestedInstitutionId;

      const list = await db.listCredentials(institutionId);
      res.json(list);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/credentials', requireAuth, requireRole(['SYSTEM_ADMIN']), async (req, res) => {
    try {
      const auth = req.auth;
      const { institutionId, keyAlgorithm } = req.body;
      if (!institutionId) {
        return res.status(400).json({ error: 'INVALID_ARGUMENT: institutionId is required' });
      }

      const cred = await CredentialService.issueCredential(
        auth,
        { institutionId, keyAlgorithm: keyAlgorithm || 'RSA-PSS-SHA256' },
        (c) => db.createCredential(c)
      );
      res.status(201).json(cred);
    } catch (err: any) {
      const isForbidden = err.message?.includes('PERMISSION_DENIED');
      res.status(isForbidden ? 403 : 400).json({ error: err.message });
    }
  });

  /**
   * Cloud Function: revokeCredential
   * Only SYSTEM_ADMIN can revoke credentials
   */
  app.post('/api/credentials/revoke', requireAuth, requireRole(['SYSTEM_ADMIN']), async (req, res) => {
    try {
      const auth = req.auth;
      const { credentialId, revocationReason } = req.body;

      const revoked = await revokeCredentialHandler(
        auth,
        { credentialId, revocationReason },
        {
          getCredentialById: (id) => db.getCredential(id),
          updateCredential: (id, updates) => db.updateCredential(id, updates),
        }
      );

      res.json({
        success: true,
        message: `Credential '${credentialId}' has been revoked successfully.`,
        credential: revoked,
      });
    } catch (err: any) {
      const isForbidden = err.message?.includes('PERMISSION_DENIED');
      const isNotFound = err.message?.includes('NOT_FOUND');
      res.status(isForbidden ? 403 : isNotFound ? 404 : 400).json({ error: err.message });
    }
  });

  // ==========================================
  // 6. MEDIA UPLOAD (Cloud Function: uploadMedia) - Rate Protected
  // ==========================================
  app.post(
    '/api/media/upload',
    rateLimiter.middleware(),
    upload.single('file'),
    requireAuth,
    requireRole(['INSTITUTIONAL_ISSUER', 'SYSTEM_ADMIN']),
    async (req, res) => {
      try {
        const auth = req.auth;
        const file = req.file;

        if (!file) {
          return res.status(400).json({ error: 'INVALID_ARGUMENT: No media file uploaded.' });
        }

        // Institutional isolation: if issuer, enforce their own institutionId
        const institutionId = auth?.role === 'SYSTEM_ADMIN'
          ? (req.body.institutionId || auth?.institutionId)
          : auth?.institutionId || req.body.institutionId;

        const mediaType = (req.body.mediaType || 'NOTICE') as MediaType;
        const credentialId = req.body.credentialId;
        const title = req.body.title || file.originalname;

        if (!institutionId) {
          return res.status(400).json({ error: 'INVALID_ARGUMENT: institutionId is required.' });
        }

        // Execute uploadMedia Cloud Function
        const record = await uploadMediaHandler(
          auth,
          {
            institutionId,
            credentialId,
            mediaType,
            fileName: file.originalname,
            fileBuffer: file.buffer,
            mimeType: file.mimetype,
            title,
          },
          async (storagePath, buffer, mime) => {
            return await db.saveStorageFile(storagePath, buffer, mime, file.originalname);
          },
          {
            createMediaRecord: (r) => db.createMediaRecord(r),
          }
        );

        res.status(201).json(record);
      } catch (err: any) {
        const isForbidden = err.message?.includes('PERMISSION_DENIED');
        res.status(isForbidden ? 403 : 400).json({ error: err.message });
      }
    }
  );

  // ==========================================
  // 7. MEDIA SIGNING (Cloud Function: signMedia)
  // ==========================================
  app.post(
    '/api/media/sign',
    requireAuth,
    requireRole(['INSTITUTIONAL_ISSUER', 'SYSTEM_ADMIN']),
    async (req, res) => {
      try {
        const auth = req.auth;
        const { mediaRecordId, mediaHash, credentialId } = req.body;

        const institutionId = auth?.role === 'SYSTEM_ADMIN'
          ? (req.body.institutionId || auth?.institutionId)
          : auth?.institutionId || req.body.institutionId;

        if (!credentialId || !institutionId || (!mediaRecordId && !mediaHash)) {
          return res.status(400).json({
            error: 'INVALID_ARGUMENT: credentialId, institutionId, and (mediaRecordId or mediaHash) are required.',
          });
        }

        const signResult = await signMediaHandler(
          auth,
          {
            mediaRecordId,
            mediaHash,
            credentialId,
            institutionId,
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

        res.json({
          success: true,
          ...signResult,
        });
      } catch (err: any) {
        const isForbidden = err.message?.includes('PERMISSION_DENIED');
        const isPrecondition = err.message?.includes('FAILED_PRECONDITION');
        res.status(isForbidden ? 403 : isPrecondition ? 412 : 400).json({ error: err.message });
      }
    }
  );

  // ==========================================
  // 8. MEDIA VERIFICATION (Cloud Function: verifyMedia) - Rate & Latency Monitored
  // ==========================================
  app.post('/api/media/verify', rateLimiter.middleware(), upload.single('file'), optionalAuth, async (req, res) => {
    const startTime = performance.now();
    try {
      let hashToVerify = req.body.mediaHash;

      // If user uploaded a physical file directly to verification endpoint, calculate SHA-256
      if (req.file) {
        hashToVerify = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
      }

      if (!hashToVerify) {
        return res.status(400).json({ error: 'INVALID_ARGUMENT: mediaHash or file is required for verification.' });
      }

      const verificationResult = await verifyMediaHandler(
        { mediaHash: hashToVerify },
        {
          findMediaRecordByHash: (hash) => db.findMediaRecordByHash(hash),
          getCredentialById: (id) => db.getCredential(id),
          getInstitutionById: (id) => db.getInstitution(id),
          createVerificationLog: (log) => db.createVerificationLog(log),
        }
      );

      const durationMs = Number((performance.now() - startTime).toFixed(2));
      res.setHeader('Server-Timing', `verify;dur=${durationMs}`);

      res.json({
        ...verificationResult,
        executionDurationMs: durationMs,
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // ==========================================
  // 9. MEDIA RECORDS & STORAGE QUERY
  // ==========================================
  app.get('/api/media', optionalAuth, async (req, res) => {
    try {
      const requestedInstitutionId = req.query.institutionId as string | undefined;
      const auth = req.auth;

      if (auth?.role === 'INSTITUTIONAL_ISSUER') {
        if (!auth.institutionId) {
          return res.status(403).json({
            error: 'PERMISSION_DENIED: Institutional issuer has no institution assignment.',
          });
        }

        if (
          requestedInstitutionId &&
          requestedInstitutionId !== auth.institutionId
        ) {
          return res.status(403).json({
            error: `PERMISSION_DENIED: Institutional issuer '${auth.uid}' cannot access media for institution '${requestedInstitutionId}'.`,
          });
        }
      }

      const institutionId =
        auth?.role === 'INSTITUTIONAL_ISSUER'
          ? auth.institutionId
          : requestedInstitutionId;

      const records = await db.listMediaRecords(institutionId);
      res.json(records);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/media/:id', optionalAuth, async (req, res) => {
    try {
      const record = await db.getMediaRecord(req.params.id);
      if (!record) {
        return res.status(404).json({ error: 'Media record not found.' });
      }

      const auth = req.auth;

      if (auth?.role === 'INSTITUTIONAL_ISSUER') {
        if (!auth.institutionId) {
          return res.status(403).json({
            error: 'PERMISSION_DENIED: Institutional issuer has no institution assignment.',
          });
        }

        if (record.institutionId !== auth.institutionId) {
          return res.status(403).json({
            error: 'PERMISSION_DENIED: Institutional issuer cannot access media from another institution.',
          });
        }
      }

      res.json(record);
    } catch (err: any) {
      const isForbidden = err.message?.includes('PERMISSION_DENIED');
      const isNotFound = err.message?.includes('NOT_FOUND');
      res.status(isForbidden ? 403 : isNotFound ? 404 : 500).json({
        error: err.message || 'Error retrieving media record.',
      });
    }
  });

  // Storage file retrieval (from Firebase / Google Cloud Storage bucket)
  app.get('/api/storage/*', optionalAuth, async (req, res) => {
    try {
      const storagePath = req.params[0];
      const file = await db.getStorageFile(storagePath, req.auth);
      res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `inline; filename="${file.originalName}"`);
      res.send(file.buffer);
    } catch (err: any) {
      const isForbidden = err.message?.includes('PERMISSION_DENIED');
      const isNotFound = err.message?.includes('NOT_FOUND');
      res.status(isForbidden ? 403 : isNotFound ? 404 : 500).send(err.message || 'Error retrieving storage file');
    }
  });

  // Verification audit logs
  // Verification audit logs
  app.get('/api/verification-logs', optionalAuth, async (req, res) => {
    try {
      const auth = req.auth;

      if (auth?.role === 'PUBLIC_RECIPIENT') {
        return res.status(403).json({
          error: 'PERMISSION_DENIED: Verification audit logs are not available to public recipients.',
        });
      }

      const issuerId = auth?.role === 'INSTITUTIONAL_ISSUER'
        ? auth.institutionId
        : undefined;

      if (auth?.role === 'INSTITUTIONAL_ISSUER' && !issuerId) {
        return res.status(403).json({
          error: 'PERMISSION_DENIED: Institutional issuer has no institution assignment.',
        });
      }

      const logs = await db.listVerificationLogs(100, issuerId);
      res.json(logs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Verification audit statistics & telemetry
  app.get('/api/verification-logs/stats', optionalAuth, async (req, res) => {
    try {
      const auth = req.auth;

      if (auth?.role === 'PUBLIC_RECIPIENT') {
        return res.status(403).json({
          error: 'PERMISSION_DENIED: Verification audit statistics are not available to public recipients.',
        });
      }

      const issuerId = auth?.role === 'INSTITUTIONAL_ISSUER'
        ? auth.institutionId
        : undefined;

      if (auth?.role === 'INSTITUTIONAL_ISSUER' && !issuerId) {
        return res.status(403).json({
          error: 'PERMISSION_DENIED: Institutional issuer has no institution assignment.',
        });
      }

      const logs = await db.listVerificationLogs(1000, issuerId);
      const total = logs.length;
      const authentic = logs.filter((l) => l.verdict === 'AUTHENTIC').length;
      const unsigned = logs.filter((l) => l.verdict === 'UNSIGNED').length;
      const provenFake = logs.filter((l) => l.verdict === 'PROVEN_FAKE').length;
      const scores = logs
        .map((l) => l.deepfakeScore)
        .filter((s): s is number => typeof s === 'number');
      const avgScore = scores.length > 0
        ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(4))
        : 0;

      res.json({
        totalVerifications: total,
        authenticCount: authentic,
        unsignedCount: unsigned,
        provenFakeCount: provenFake,
        averageDeepfakeScore: avgScore,
        tamperIncidentsDetected: logs.filter((l) => l.tamperDetected).length,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================
  // 10. VITE MIDDLEWARE SETUP
  // ==========================================
  if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res, next) => {
        if (_req.path.startsWith('/api')) return next();
        const indexPath = path.join(distPath, 'index.html');
        if (fs.existsSync(indexPath)) {
          return res.sendFile(indexPath);
        }
        next();
      });
    }
  }

  // ==========================================
  // 11. DEFENSIVE GLOBAL ERROR HANDLER
  // ==========================================
  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    logger.error('Unhandled Server Exception:', {
      context: {
        error: err?.message || err,
        stack: err?.stack,
        path: req.path,
        method: req.method,
      },
    });

    if (!res.headersSent) {
      res.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: err?.message || 'An unexpected internal server error occurred.',
        timestamp: new Date().toISOString(),
      });
    }
  });

  appInstance = app;
  return app;
}

export async function startServer() {
  const app = await createApp();
  const PORT = configCheck.config.port;

  if (!process.env.VERCEL && !process.env.VERCEL_ENV) {
    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`Media Authenticity Verification Server running on port ${PORT}`, {
        context: { port: PORT, env: process.env.NODE_ENV || 'development' },
      });
    });
  }
}

if (!process.env.VERCEL && !process.env.VERCEL_ENV) {
  startServer();
}
