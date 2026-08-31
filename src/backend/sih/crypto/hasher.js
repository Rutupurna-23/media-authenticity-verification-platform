const crypto = require('crypto');

/**
 * Compute SHA-256 hash of a string, object, or buffer
 */
function sha256(data) {
    const hash = crypto.createHash('sha256');
    if (Buffer.isBuffer(data)) {
        hash.update(data);
    } else if (typeof data === 'object') {
        hash.update(JSON.stringify(data));
    } else {
        hash.update(String(data));
    }
    return hash.digest('hex');
}

/**
 * Compute Merkle root of a list of transaction/seal hashes
 */
function calculateMerkleRoot(hashes) {
    if (!hashes || hashes.length === 0) {
        return sha256('EMPTY_BLOCK');
    }
    let currentLevel = hashes.slice();
    while (currentLevel.length > 1) {
        const nextLevel = [];
        for (let i = 0; i < currentLevel.length; i += 2) {
            const left = currentLevel[i];
            const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : left;
            nextLevel.push(sha256(left + right));
        }
        currentLevel = nextLevel;
    }
    return currentLevel[0];
}

/**
 * Secure password hashing using PBKDF2 with salt
 */
function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
    return { salt, hash };
}

/**
 * Verify password against salt and stored hash
 */
function verifyPassword(password, salt, storedHash) {
    const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(storedHash, 'hex'));
}

/**
 * Generate unique cryptographic Seal number
 * e.g., TS-2026-A8F4-9C12
 */
function generateSealNumber() {
    const bytes = crypto.randomBytes(4).toString('hex').toUpperCase();
    const bytes2 = crypto.randomBytes(2).toString('hex').toUpperCase();
    return `TS-2026-${bytes.slice(0, 4)}-${bytes.slice(4)}${bytes2}`;
}

/**
 * Sign data with secret key (HMAC-SHA256 signature)
 */
function signPayload(payload, secretKey) {
    const hmac = crypto.createHmac('sha256', secretKey);
    hmac.update(typeof payload === 'string' ? payload : JSON.stringify(payload));
    return hmac.digest('hex');
}

/**
 * Verify digital signature
 */
function verifySignature(payload, signature, secretKey) {
    const expected = signPayload(payload, secretKey);
    return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
}

module.exports = {
    sha256,
    calculateMerkleRoot,
    hashPassword,
    verifyPassword,
    generateSealNumber,
    signPayload,
    verifySignature
};
