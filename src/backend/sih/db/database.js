const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const config = require('../config');
const { hashPassword, sha256 } = require('../crypto/hasher');

// Ensure data and upload directory exists
const dataDir = path.dirname(config.DB_PATH);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}
if (!fs.existsSync(config.UPLOAD_DIR)) {
    fs.mkdirSync(config.UPLOAD_DIR, { recursive: true });
}

// Clean up any test db files
const testDb = path.join(dataDir, 'test.db');
if (fs.existsSync(testDb)) {
    try { fs.unlinkSync(testDb); } catch (_) {}
}

const db = new DatabaseSync(config.DB_PATH);

// Enable WAL mode for high concurrency
try {
    db.exec('PRAGMA journal_mode = WAL;');
} catch (_) {}

function initSchema() {
    // 1. USERS TABLE
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            salt TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'user',
            organization TEXT,
            created_at TEXT NOT NULL
        );
    `);

    // 2. BLOCKCHAIN TABLE
    db.exec(`
        CREATE TABLE IF NOT EXISTS blockchain (
            block_height INTEGER PRIMARY KEY,
            prev_hash TEXT NOT NULL,
            merkle_root TEXT NOT NULL,
            data_count INTEGER NOT NULL DEFAULT 0,
            timestamp INTEGER NOT NULL,
            nonce INTEGER NOT NULL DEFAULT 0,
            hash TEXT NOT NULL
        );
    `);

    // 3. SEALS / CERTIFICATES TABLE
    db.exec(`
        CREATE TABLE IF NOT EXISTS seals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            seal_number TEXT UNIQUE NOT NULL,
            issuer_id INTEGER NOT NULL,
            issuer_name TEXT NOT NULL,
            issuer_org TEXT,
            recipient_name TEXT NOT NULL,
            recipient_email TEXT,
            doc_name TEXT NOT NULL,
            doc_type TEXT,
            doc_hash TEXT NOT NULL,
            signature TEXT NOT NULL,
            metadata TEXT,
            status TEXT NOT NULL DEFAULT 'ACTIVE',
            revocation_reason TEXT,
            revoked_at TEXT,
            issued_at TEXT NOT NULL,
            block_height INTEGER,
            block_hash TEXT,
            FOREIGN KEY (issuer_id) REFERENCES users(id)
        );
    `);

    // 4. VERIFICATIONS TABLE
    db.exec(`
        CREATE TABLE IF NOT EXISTS verifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            seal_number TEXT,
            doc_hash TEXT,
            status_result TEXT NOT NULL,
            verifier_ip TEXT,
            verified_at TEXT NOT NULL
        );
    `);

    // 5. AUDIT LOGS TABLE
    db.exec(`
        CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            action TEXT NOT NULL,
            user_id INTEGER,
            details TEXT,
            timestamp TEXT NOT NULL
        );
    `);

    // Seed Genesis Block if chain is empty
    const genesisBlock = db.prepare('SELECT * FROM blockchain WHERE block_height = 0').get();
    if (!genesisBlock) {
        const genesisPrevHash = '0000000000000000000000000000000000000000000000000000000000000000';
        const genesisMerkle = sha256('TRUTHSEAL_GENESIS_BLOCK_SIH2026');
        const genesisTimestamp = 1772390400000; // 2026 reference timestamp
        const genesisHash = sha256(`0:${genesisPrevHash}:${genesisMerkle}:${genesisTimestamp}:0`);

        db.prepare(`
            INSERT INTO blockchain (block_height, prev_hash, merkle_root, data_count, timestamp, nonce, hash)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(0, genesisPrevHash, genesisMerkle, 0, genesisTimestamp, 0, genesisHash);
    }

    // Seed Demo Accounts if not present
    seedDemoAccount('Dr. Rajesh Kumar', 'issuer@truthseal.io', 'TruthSeal@2026', 'issuer', 'National Tech University (Issuer Authority)');
    seedDemoAccount('Pooja Mehta', 'verifier@truthseal.io', 'TruthSeal@2026', 'verifier', 'Global Talent Verification Agency');
    seedDemoAccount('Aarav Sharma', 'student@truthseal.io', 'TruthSeal@2026', 'user', 'Certificate & Credential Holder');
    seedDemoAccount('Admin Root', 'admin@truthseal.io', 'TruthSeal@2026', 'admin', 'TruthSeal Core Security');
}

function seedDemoAccount(name, email, password, role, organization) {
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (!existing) {
        const { salt, hash } = hashPassword(password);
        const now = new Date().toISOString();
        db.prepare(`
            INSERT INTO users (name, email, password_hash, salt, role, organization, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(name, email, hash, salt, role, organization, now);
    }
}

// Initialize database schema on load
initSchema();

module.exports = db;
