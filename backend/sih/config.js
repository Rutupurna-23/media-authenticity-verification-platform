import path from 'path';
import os from 'os';

const isVercel = Boolean(process.env.VERCEL || process.env.VERCEL_ENV);
const tmpDir = os.tmpdir();

export default {
    PORT: process.env.PORT || 3000,
    JWT_SECRET: process.env.JWT_SECRET || 'truthseal_super_secret_cryptographic_key_2026_sih',
    JWT_EXPIRES_IN: 24 * 60 * 60 * 1000, // 24 hours
    DB_PATH: isVercel ? path.join(tmpDir, 'truthseal.db') : path.join(process.cwd(), 'backend', 'data', 'truthseal.db'),
    UPLOAD_DIR: isVercel ? path.join(tmpDir, 'uploads') : path.join(process.cwd(), 'backend', 'data', 'uploads'),
    CHAIN_DIFFICULTY: 1, // Proof of work difficulty for block mining
    SYSTEM_ISSUER: 'TruthSeal Cryptographic Trust Network'
};
