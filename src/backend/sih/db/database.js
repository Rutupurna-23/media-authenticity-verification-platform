import fs from 'fs';
import path from 'path';
import config from '../config.js';
import { hashPassword, sha256 } from '../crypto/hasher.js';

// Ensure data and upload directory exists if possible
try {
  const dataDir = path.dirname(config.DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(config.UPLOAD_DIR)) {
    fs.mkdirSync(config.UPLOAD_DIR, { recursive: true });
  }
} catch (_) {
  // Ignore filesystem creation errors on read-only environments
}

let nativeDb = null;

try {
  const { DatabaseSync } = require('node:sqlite');
  nativeDb = new DatabaseSync(config.DB_PATH);
  try {
    nativeDb.exec('PRAGMA journal_mode = WAL;');
  } catch (_) {}
} catch (err) {
  console.warn('Native node:sqlite is unavailable or read-only on this runtime. Falling back to In-Memory DB Mode:', err?.message || err);
}

// In-Memory Database Fallback Adapter if native sqlite cannot be loaded
class InMemoryDbAdapter {
  constructor() {
    this.tables = {
      users: [],
      blockchain: [],
      seals: [],
      verifications: [],
      audit_logs: [],
    };
    this.autoIncrement = {
      users: 1,
      seals: 1,
      verifications: 1,
      audit_logs: 1,
    };
  }

  exec(sql) {
    // No-op for schema creation in memory
  }

  prepare(sql) {
    const adapter = this;
    return {
      run(...args) {
        if (sql.includes('INSERT INTO blockchain')) {
          const [block_height, prev_hash, merkle_root, data_count, timestamp, nonce, hash] = args;
          adapter.tables.blockchain.push({
            block_height, prev_hash, merkle_root, data_count, timestamp, nonce, hash
          });
          return { lastInsertRowid: block_height, changes: 1 };
        }

        if (sql.includes('INSERT INTO users')) {
          const [name, email, password_hash, salt, role, organization, created_at] = args;
          const id = adapter.autoIncrement.users++;
          adapter.tables.users.push({
            id, name, email, password_hash, salt, role, organization, created_at
          });
          return { lastInsertRowid: id, changes: 1 };
        }

        if (sql.includes('INSERT INTO seals')) {
          const [
            seal_number, issuer_id, issuer_name, issuer_org,
            recipient_name, recipient_email, doc_name, doc_type,
            doc_hash, signature, metadata, issued_at,
            block_height, block_hash
          ] = args;
          const id = adapter.autoIncrement.seals++;
          adapter.tables.seals.push({
            id, seal_number, issuer_id, issuer_name, issuer_org,
            recipient_name, recipient_email, doc_name, doc_type,
            doc_hash, signature, metadata, status: 'ACTIVE', issued_at,
            block_height, block_hash, revocation_reason: null, revoked_at: null
          });
          return { lastInsertRowid: id, changes: 1 };
        }

        if (sql.includes('INSERT INTO verifications')) {
          const [seal_number, doc_hash, status_result, verifier_ip, verified_at] = args;
          const id = adapter.autoIncrement.verifications++;
          adapter.tables.verifications.push({
            id, seal_number, doc_hash, status_result, verifier_ip, verified_at
          });
          return { lastInsertRowid: id, changes: 1 };
        }

        if (sql.includes('INSERT INTO audit_logs')) {
          const [action, user_id, details, timestamp] = args;
          const id = adapter.autoIncrement.audit_logs++;
          adapter.tables.audit_logs.push({
            id, action, user_id, details, timestamp
          });
          return { lastInsertRowid: id, changes: 1 };
        }

        if (sql.includes('UPDATE seals')) {
          const [reason, revokedAt, sealNumber] = args;
          const seal = adapter.tables.seals.find(s => s.seal_number === sealNumber);
          if (seal) {
            seal.status = 'REVOKED';
            seal.revocation_reason = reason;
            seal.revoked_at = revokedAt;
            return { changes: 1 };
          }
          return { changes: 0 };
        }

        return { lastInsertRowid: 1, changes: 1 };
      },

      get(...args) {
        if (sql.includes('FROM blockchain WHERE block_height = 0')) {
          return adapter.tables.blockchain.find(b => b.block_height === 0);
        }
        if (sql.includes('FROM blockchain WHERE block_height = ?')) {
          return adapter.tables.blockchain.find(b => b.block_height === args[0]);
        }
        if (sql.includes('FROM blockchain ORDER BY block_height DESC LIMIT 1')) {
          return [...adapter.tables.blockchain].sort((a, b) => b.block_height - a.block_height)[0];
        }
        if (sql.includes('FROM users WHERE email = ?')) {
          return adapter.tables.users.find(u => u.email === args[0]);
        }
        if (sql.includes('FROM users WHERE id = ?')) {
          return adapter.tables.users.find(u => u.id === args[0]);
        }
        if (sql.includes('FROM seals WHERE seal_number = ?')) {
          return adapter.tables.seals.find(s => s.seal_number === args[0]);
        }
        if (sql.includes('FROM seals WHERE doc_hash = ?')) {
          return adapter.tables.seals.find(s => s.doc_hash === args[0]);
        }
        if (sql.includes('SELECT COUNT(*) as count FROM seals WHERE status = \'ACTIVE\'')) {
          return { count: adapter.tables.seals.filter(s => s.status === 'ACTIVE').length };
        }
        if (sql.includes('SELECT COUNT(*) as count FROM seals WHERE status = \'REVOKED\'')) {
          return { count: adapter.tables.seals.filter(s => s.status === 'REVOKED').length };
        }
        if (sql.includes('SELECT COUNT(*) as count FROM seals')) {
          return { count: adapter.tables.seals.length };
        }
        if (sql.includes('SELECT COUNT(*) as count FROM verifications')) {
          return { count: adapter.tables.verifications.length };
        }
        if (sql.includes('SELECT COUNT(*) as count FROM users')) {
          return { count: adapter.tables.users.length };
        }
        return undefined;
      },

      all(...args) {
        if (sql.includes('FROM blockchain ORDER BY block_height ASC')) {
          return [...adapter.tables.blockchain].sort((a, b) => a.block_height - b.block_height);
        }
        if (sql.includes('FROM blockchain ORDER BY block_height DESC')) {
          const limit = args[0] || 10;
          return [...adapter.tables.blockchain].sort((a, b) => b.block_height - a.block_height).slice(0, limit);
        }
        if (sql.includes('FROM seals WHERE block_height = ?')) {
          return adapter.tables.seals.filter(s => s.block_height === args[0]);
        }
        if (sql.includes('FROM seals WHERE issuer_id = ?')) {
          return adapter.tables.seals.filter(s => s.issuer_id === args[0]);
        }
        if (sql.includes('FROM seals WHERE recipient_email = ?')) {
          return adapter.tables.seals.filter(s => s.recipient_email === args[0]);
        }
        if (sql.includes('FROM seals ORDER BY id DESC')) {
          const limit = args[0] || 100;
          return [...adapter.tables.seals].sort((a, b) => b.id - a.id).slice(0, limit);
        }
        return [];
      }
    };
  }
}

const db = nativeDb || new InMemoryDbAdapter();

function initSchema() {
  try {
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
  } catch (err) {
    console.error('Schema initialization error:', err);
  }
}

function seedDemoAccount(name, email, password, role, organization) {
  try {
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (!existing) {
      const { salt, hash } = hashPassword(password);
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO users (name, email, password_hash, salt, role, organization, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(name, email, hash, salt, role, organization, now);
    }
  } catch (err) {
    console.error('Error seeding demo account:', err);
  }
}

// Initialize database schema on load
initSchema();

export default db;
