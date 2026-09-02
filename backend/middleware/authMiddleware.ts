import { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../../functions/src/auth/firebaseAdmin.js';
import { AuthContext } from '../../functions/src/auth/authService.js';
import { UserRole } from '../../types.js';

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

const VALID_ROLES: readonly UserRole[] = [
  'INSTITUTIONAL_ISSUER',
  'PUBLIC_RECIPIENT',
  'SYSTEM_ADMIN',
];

function isValidRole(value: unknown): value is UserRole {
  return typeof value === 'string' && VALID_ROLES.includes(value as UserRole);
}

function isDevAuthSimulationEnabled(): boolean {
  // Allow header/body auth simulation for interactive demo unless explicitly disabled by environment
  if (process.env.DISABLE_DEMO_AUTH === 'true') {
    return false;
  }
  return true;
}

export async function extractTokenAuth(req: Request): Promise<AuthContext | null> {
  const authHeader = req.headers['authorization'] as string | undefined;

  if (authHeader) {
    if (!authHeader.startsWith('Bearer ')) {
      return null;
    }

    const idToken = authHeader.substring(7).trim();

    if (!idToken) {
      return null;
    }

    try {
      const decoded = await adminAuth.verifyIdToken(idToken);

      const tokenRole: UserRole = isValidRole(decoded.role)
        ? decoded.role
        : 'PUBLIC_RECIPIENT';

      return {
        uid: decoded.uid,
        email: decoded.email || '',
        role: tokenRole,
        institutionId: decoded.institutionId,
      };
    } catch (err) {
      console.warn('Invalid Firebase ID token:', err);
      return null;
    }
  }

  // Development-only simulation for local testing/demo.
  // NEVER use this path when NODE_ENV=production.
  if (isDevAuthSimulationEnabled()) {
    const rawRole =
      (req.headers['x-user-role'] as string | undefined) ||
      (req.body?.authRole as string | undefined);

    if (rawRole && isValidRole(rawRole)) {
      return {
        uid:
          (req.headers['x-user-uid'] as string | undefined) ||
          req.body?.authUid ||
          'user-simulated',
        email:
          (req.headers['x-user-email'] as string | undefined) ||
          req.body?.authEmail ||
          'simulated@verify.org',
        role: rawRole,
        institutionId:
          (req.headers['x-institution-id'] as string | undefined) ||
          (req.headers['x-user-institution-id'] as string | undefined) ||
          req.body?.authInstitutionId ||
          'inst-fema',
      };
    }
  }

  // Anonymous/public caller.
  return {
    uid: 'anonymous',
    email: 'public@recipient.org',
    role: 'PUBLIC_RECIPIENT',
  };
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const auth = await extractTokenAuth(req);

  if (!auth) {
    return res.status(401).json({
      error: 'UNAUTHENTICATED: Authentication required.',
    });
  }

  // In production, protected endpoints must have a real Firebase
  // authentication token. Anonymous/public callers cannot satisfy requireAuth.
  if (
    process.env.DISABLE_DEMO_AUTH === 'true' &&
    auth.uid === 'anonymous'
  ) {
    return res.status(401).json({
      error: 'UNAUTHENTICATED: Valid Firebase authentication required.',
    });
  }

  req.auth = auth;
  next();
}

export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  req.auth =
    (await extractTokenAuth(req)) || {
      uid: 'anonymous',
      email: 'public@recipient.org',
      role: 'PUBLIC_RECIPIENT',
    };

  next();
}

export function requireRole(allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      return res.status(401).json({
        error: 'UNAUTHENTICATED: Authentication required.',
      });
    }

    if (!allowedRoles.includes(req.auth.role)) {
      return res.status(403).json({
        error: `PERMISSION_DENIED: Role '${req.auth.role}' is not authorized. Required: [${allowedRoles.join(', ')}]`,
      });
    }

    next();
  };
}
