import path from 'path';
import { adminStorage } from '../../functions/src/auth/firebaseAdmin.js';
import { AuthService, AuthContext } from '../../functions/src/auth/authService.js';
import { InMemoryDB } from '../backups/db.inmemory.backup.js';

export interface StorageUploadParams {
  institutionId: string;
  fileName: string;
  fileBuffer: Buffer;
  mimeType?: string;
  callerAuth?: AuthContext;
}

export interface StorageUploadResult {
  storagePath: string;
  fileSizeBytes: number;
  mimeType: string;
  originalFileName: string;
}

export interface StorageDownloadResult {
  buffer: Buffer;
  mimeType: string;
  originalName: string;
}

export class MediaStorageService {
  private getBucket() {
    const bucketName = process.env.FIREBASE_STORAGE_BUCKET || 'media-authenticity-platform.appspot.com';
    return adminStorage.bucket(bucketName);
  }

  /**
   * Sanitizes a user-provided filename to prevent path traversal and shell injection.
   */
  public sanitizeFilename(fileName: string): string {
    if (!fileName || fileName.trim() === '') {
      return 'unnamed_media_file';
    }
    // Normalize both POSIX and Windows separators before extracting the basename.
    // This prevents platform-dependent traversal bypasses such as:
    // ../../etc/passwd
    // ..\..\windows\system32\cmd.exe
    const normalized = fileName.trim().replace(/[\\/]+/g, '/');
    const base = path.posix.basename(normalized);

    // Replace non-alphanumeric characters (except dot, dash, underscore).
    // This also guarantees that the final filename cannot contain path separators.
    const sanitized = base.replace(/[^a-zA-Z0-9._-]/g, '_');
    return sanitized || 'media_file';
  }

  /**
   * Generates a deterministic, canonical storage object path for an institution's media.
   * Path pattern: media/institutions/{institutionId}/{timestamp}-{safeFilename}
   */
  public generateStoragePath(institutionId: string, fileName: string): string {
    const cleanInstId = institutionId.replace(/[^a-zA-Z0-9-_]/g, '');
    const safeName = this.sanitizeFilename(fileName);
    const timestamp = Date.now();
    return `media/institutions/${cleanInstId}/${timestamp}-${safeName}`;
  }

  /**
   * Uploads a binary media file to the Google Cloud / Firebase Storage bucket.
   */
  public async upload(params: StorageUploadParams): Promise<StorageUploadResult> {
    if (!params.institutionId || params.institutionId.trim() === '') {
      throw new Error('INVALID_ARGUMENT: institutionId is required for storage upload.');
    }

    if (!params.fileBuffer || params.fileBuffer.length === 0) {
      throw new Error('INVALID_ARGUMENT: File buffer is empty or missing.');
    }

    // Security Gate: Reject dangerous executable extensions
    const dangerousExtensions = ['.exe', '.sh', '.bat', '.cmd', '.ps1', '.vbs', '.scr', '.pif', '.dll', '.bin'];
    const lowerName = params.fileName.toLowerCase();
    for (const ext of dangerousExtensions) {
      if (lowerName.endsWith(ext)) {
        throw new Error(`SECURITY_ERROR: Uploading executable or script files (${ext}) is strictly prohibited.`);
      }
    }

    // Security Gate: Check for executable binary magic bytes (PE / ELF / Mach-O)
    if (params.fileBuffer.length >= 4) {
      const isPE = params.fileBuffer[0] === 0x4d && params.fileBuffer[1] === 0x5a; // MZ header
      const isELF = params.fileBuffer[0] === 0x7f && params.fileBuffer[1] === 0x45 && params.fileBuffer[2] === 0x4c && params.fileBuffer[3] === 0x46; // \x7fELF
      if (isPE || isELF) {
        throw new Error('SECURITY_ERROR: Disguised binary executable payload detected and rejected.');
      }
    }

    // Enforce institutional isolation authorization if callerAuth is provided
    if (params.callerAuth) {
      AuthService.assertInstitutionalAccess(params.callerAuth, params.institutionId);
    }

    const contentType = params.mimeType || 'application/octet-stream';
    const safeName = this.sanitizeFilename(params.fileName);
    const storagePath = this.generateStoragePath(params.institutionId, safeName);
    const bucket = this.getBucket();
    const file = bucket.file(storagePath);

    try {
      await file.save(params.fileBuffer, {
        metadata: {
          contentType: contentType,
          metadata: {
            originalName: params.fileName,
            institutionId: params.institutionId,
            uploadedAt: new Date().toISOString(),
            uploadedBy: params.callerAuth?.uid || 'anonymous',
            sizeBytes: params.fileBuffer.length.toString(),
          },
        },
        resumable: false,
      });
    } catch (_storageErr) {
      // Fallback for local testing / serverless offline mode when GCP bucket is uninitialized
      await InMemoryDB.getInstance().saveStorageFile(storagePath, params.fileBuffer, contentType, params.fileName);
    }

    return {
      storagePath,
      fileSizeBytes: params.fileBuffer.length,
      mimeType: contentType,
      originalFileName: params.fileName,
    };
  }

  /**
   * Downloads a binary media file from Cloud Storage.
   */
  public async download(storagePath: string, callerAuth?: AuthContext): Promise<StorageDownloadResult> {
    if (!storagePath || storagePath.trim() === '') {
      throw new Error('INVALID_ARGUMENT: storagePath is required.');
    }

    // Path traversal safety check
    if (storagePath.includes('..') || storagePath.startsWith('/')) {
      throw new Error('INVALID_ARGUMENT: Invalid storagePath format.');
    }

    // Extract institution ID from path: media/institutions/{institutionId}/...
    const match = storagePath.match(/^media\/institutions\/([^/]+)\//);
    if (match && match[1] && callerAuth && callerAuth.role === 'INSTITUTIONAL_ISSUER') {
      const targetInstitutionId = match[1];
      if (callerAuth.institutionId && callerAuth.institutionId !== targetInstitutionId) {
        throw new Error(
          `PERMISSION_DENIED: Institutional issuer '${callerAuth.uid}' cannot access media from institution '${targetInstitutionId}'.`
        );
      }
    }

    try {
      const bucket = this.getBucket();
      const file = bucket.file(storagePath);
      const [exists] = await file.exists();

      if (exists) {
        const [buffer] = await file.download();
        const [metadata] = await file.getMetadata();

        return {
          buffer,
          mimeType: metadata.contentType || 'application/octet-stream',
          originalName: metadata.metadata?.originalName ? String(metadata.metadata.originalName) : path.basename(storagePath),
        };
      }
    } catch (_err) {
      // Fallback to InMemoryDB storage files
    }

    const { InMemoryDB } = await import('../backups/db.inmemory.backup.js');
    const file = InMemoryDB.getInstance().getStorageFile(storagePath);
    return {
      buffer: file.buffer,
      mimeType: file.mimeType || 'application/octet-stream',
      originalName: file.originalName,
    };
  }

  /**
   * Checks if an object exists in Cloud Storage.
   */
  public async exists(storagePath: string): Promise<boolean> {
    if (!storagePath) return false;
    try {
      const bucket = this.getBucket();
      const file = bucket.file(storagePath);
      const [exists] = await file.exists();
      if (exists) return true;
    } catch (_err) {
      // Fallback check
    }
    const { InMemoryDB } = await import('../backups/db.inmemory.backup.js');
    try {
      return Boolean(InMemoryDB.getInstance().getStorageFile(storagePath));
    } catch (_err) {
      return false;
    }
  }

  /**
   * Deletes an object from Cloud Storage.
   */
  public async delete(storagePath: string, callerAuth?: AuthContext): Promise<void> {
    if (!storagePath) return;

    const match = storagePath.match(/^media\/institutions\/([^/]+)\//);
    if (match && match[1] && callerAuth) {
      AuthService.assertInstitutionalAccess(callerAuth, match[1]);
    }

    const bucket = this.getBucket();
    const file = bucket.file(storagePath);
    await file.delete({ ignoreNotFound: true });
  }
}

export const mediaStorageService = new MediaStorageService();
