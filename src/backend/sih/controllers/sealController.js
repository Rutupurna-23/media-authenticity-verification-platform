const fs = require('fs');
const db = require('../db/database');
const config = require('../config');
const { sha256, generateSealNumber, signPayload, verifySignature } = require('../crypto/hasher');
const { createBlock, getLatestBlock } = require('../crypto/blockchain');

/**
 * Issue a new cryptographic seal
 * POST /api/seals/issue
 */
function issueSeal(req, res) {
    try {
        const {
            recipient_name,
            recipient_email = '',
            doc_name,
            doc_type = 'DOCUMENT',
            doc_hash: providedHash,
            metadata = {}
        } = req.body;

        if (!recipient_name || !doc_name) {
            return res.status(400).json({
                success: false,
                error: 'Recipient name and document name are required.'
            });
        }

        // Determine document SHA-256 hash
        let finalDocHash = '';
        if (req.file) {
            finalDocHash = sha256(req.file.buffer);
        } else if (providedHash && providedHash.trim().length === 64) {
            finalDocHash = providedHash.trim().toLowerCase();
        } else {
            // Compute hash from document payload metadata
            finalDocHash = sha256(`${doc_name}:${recipient_name}:${Date.now()}:${JSON.stringify(metadata)}`);
        }

        const sealNumber = generateSealNumber();
        const issuedAt = new Date().toISOString();
        const issuerId = req.user.id;
        const issuerName = req.user.name;
        const issuerOrg = req.user.organization || config.SYSTEM_ISSUER;

        // Create cryptographic digital signature
        const signaturePayload = {
            sealNumber,
            issuerId,
            recipient_name,
            doc_name,
            doc_hash: finalDocHash,
            issuedAt
        };
        const signature = signPayload(signaturePayload, config.JWT_SECRET);

        // Commit transaction to blockchain block
        const txHash = sha256(`${sealNumber}:${finalDocHash}:${signature}:${issuedAt}`);
        const minedBlock = createBlock([txHash]);

        // Insert seal record into database
        const metadataStr = typeof metadata === 'string' ? metadata : JSON.stringify(metadata);
        const insert = db.prepare(`
            INSERT INTO seals (
                seal_number, issuer_id, issuer_name, issuer_org,
                recipient_name, recipient_email, doc_name, doc_type,
                doc_hash, signature, metadata, status, issued_at,
                block_height, block_hash
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)
        `);

        insert.run(
            sealNumber,
            issuerId,
            issuerName,
            issuerOrg,
            recipient_name.trim(),
            recipient_email.trim().toLowerCase(),
            doc_name.trim(),
            doc_type.trim(),
            finalDocHash,
            signature,
            metadataStr,
            issuedAt,
            minedBlock.block_height,
            minedBlock.hash
        );

        // Log audit trail
        db.prepare(`
            INSERT INTO audit_logs (action, user_id, details, timestamp)
            VALUES (?, ?, ?, ?)
        `).run('SEAL_ISSUED', issuerId, `Seal ${sealNumber} issued for ${recipient_name} on Block #${minedBlock.block_height}`, issuedAt);

        return res.status(201).json({
            success: true,
            message: 'Cryptographic seal successfully issued and anchored to blockchain.',
            seal: {
                seal_number: sealNumber,
                recipient_name: recipient_name.trim(),
                recipient_email: recipient_email.trim(),
                doc_name: doc_name.trim(),
                doc_type: doc_type.trim(),
                doc_hash: finalDocHash,
                status: 'ACTIVE',
                issuer: {
                    id: issuerId,
                    name: issuerName,
                    organization: issuerOrg
                },
                blockchain_proof: {
                    block_height: minedBlock.block_height,
                    block_hash: minedBlock.hash,
                    prev_hash: minedBlock.prev_hash,
                    merkle_root: minedBlock.merkle_root,
                    transaction_hash: txHash,
                    timestamp: minedBlock.timestamp
                },
                signature,
                issued_at: issuedAt,
                verification_url: `/verify.html?seal=${sealNumber}`
            }
        });
    } catch (error) {
        console.error('Issue Seal Error:', error);
        return res.status(500).json({ success: false, error: 'Failed to issue seal.' });
    }
}

/**
 * Verify seal authenticity
 * GET /api/seals/verify/:sealNumber or POST /api/seals/verify
 */
function verifySeal(req, res) {
    try {
        let sealNumber = (req.params.sealNumber || req.body.seal_number || req.query.seal || '').trim();
        let targetDocHash = (req.body.doc_hash || '').trim();

        // If file uploaded for direct verification
        if (req.file) {
            targetDocHash = sha256(req.file.buffer);
        }

        let seal = null;
        if (sealNumber) {
            seal = db.prepare('SELECT * FROM seals WHERE seal_number = ?').get(sealNumber);
        } else if (targetDocHash) {
            seal = db.prepare('SELECT * FROM seals WHERE doc_hash = ?').get(targetDocHash);
            if (seal) sealNumber = seal.seal_number;
        }

        const now = new Date().toISOString();
        const clientIp = req.ip || '127.0.0.1';

        if (!seal) {
            db.prepare(`
                INSERT INTO verifications (seal_number, doc_hash, status_result, verifier_ip, verified_at)
                VALUES (?, ?, ?, ?, ?)
            `).run(sealNumber || 'UNKNOWN', targetDocHash || 'NONE', 'NOT_FOUND', clientIp, now);

            return res.status(404).json({
                success: false,
                is_authentic: false,
                verdict: 'NOT_FOUND',
                message: 'No cryptographic seal found matching the provided Seal ID or Document Hash.'
            });
        }

        // Check if document was uploaded and matches sealed hash
        let hashMatch = true;
        if (targetDocHash && targetDocHash.toLowerCase() !== seal.doc_hash.toLowerCase()) {
            hashMatch = false;
        }

        // Verify cryptographic signature
        const signaturePayload = {
            sealNumber: seal.seal_number,
            issuerId: seal.issuer_id,
            recipient_name: seal.recipient_name,
            doc_name: seal.doc_name,
            doc_hash: seal.doc_hash,
            issuedAt: seal.issued_at
        };
        const isSignatureValid = verifySignature(signaturePayload, seal.signature, config.JWT_SECRET);

        // Verify blockchain block existence
        const block = db.prepare('SELECT * FROM blockchain WHERE block_height = ?').get(seal.block_height);
        const isBlockValid = block && block.hash === seal.block_hash;

        // Determine verdict
        let verdict = 'AUTHENTIC';
        let isAuthentic = true;
        let message = 'Cryptographic Seal verified. Document is authentic and untampered.';

        if (!hashMatch) {
            verdict = 'TAMPERED';
            isAuthentic = false;
            message = 'Document content does not match the original sealed hash. Tampering detected!';
        } else if (seal.status === 'REVOKED') {
            verdict = 'REVOKED';
            isAuthentic = false;
            message = `This seal was revoked on ${seal.revoked_at}. Reason: ${seal.revocation_reason || 'Administrative revocation'}.`;
        } else if (!isSignatureValid || !isBlockValid) {
            verdict = 'INVALID_SIGNATURE';
            isAuthentic = false;
            message = 'Cryptographic signature or blockchain proof verification failed.';
        }

        // Record verification
        db.prepare(`
            INSERT INTO verifications (seal_number, doc_hash, status_result, verifier_ip, verified_at)
            VALUES (?, ?, ?, ?, ?)
        `).run(seal.seal_number, seal.doc_hash, verdict, clientIp, now);

        let parsedMetadata = {};
        try {
            parsedMetadata = JSON.parse(seal.metadata || '{}');
        } catch (_) {}

        return res.json({
            success: true,
            is_authentic: isAuthentic,
            verdict,
            message,
            seal: {
                seal_number: seal.seal_number,
                status: seal.status,
                recipient_name: seal.recipient_name,
                recipient_email: seal.recipient_email,
                doc_name: seal.doc_name,
                doc_type: seal.doc_type,
                doc_hash: seal.doc_hash,
                metadata: parsedMetadata,
                issued_at: seal.issued_at,
                revoked_at: seal.revoked_at,
                revocation_reason: seal.revocation_reason,
                issuer: {
                    id: seal.issuer_id,
                    name: seal.issuer_name,
                    organization: seal.issuer_org
                },
                blockchain_proof: {
                    block_height: seal.block_height,
                    block_hash: seal.block_hash,
                    confirmed: !!isBlockValid
                },
                cryptography: {
                    signature_valid: isSignatureValid,
                    hash_match: hashMatch,
                    algorithm: 'SHA-256 / HMAC-SHA256'
                }
            }
        });
    } catch (error) {
        console.error('Verify Seal Error:', error);
        return res.status(500).json({ success: false, error: 'Verification error occurred.' });
    }
}

/**
 * Revoke an existing seal
 * POST /api/seals/revoke
 */
function revokeSeal(req, res) {
    try {
        const { seal_number, reason = 'Administrative revocation' } = req.body;
        if (!seal_number) {
            return res.status(400).json({ success: false, error: 'Seal number is required.' });
        }

        const seal = db.prepare('SELECT * FROM seals WHERE seal_number = ?').get(seal_number.trim());
        if (!seal) {
            return res.status(404).json({ success: false, error: 'Seal not found.' });
        }

        // Check if current user is the issuer or admin
        if (req.user.role !== 'admin' && seal.issuer_id !== req.user.id) {
            return res.status(403).json({ success: false, error: 'Only the issuing authority or admin can revoke this seal.' });
        }

        const now = new Date().toISOString();
        db.prepare(`
            UPDATE seals
            SET status = 'REVOKED', revocation_reason = ?, revoked_at = ?
            WHERE seal_number = ?
        `).run(reason.trim(), now, seal.seal_number);

        // Anchor revocation on blockchain
        const revTxHash = sha256(`REVOCATION:${seal.seal_number}:${reason}:${now}`);
        const revBlock = createBlock([revTxHash]);

        // Audit log
        db.prepare(`
            INSERT INTO audit_logs (action, user_id, details, timestamp)
            VALUES (?, ?, ?, ?)
        `).run('SEAL_REVOKED', req.user.id, `Seal ${seal.seal_number} revoked on Block #${revBlock.block_height}. Reason: ${reason}`, now);

        return res.json({
            success: true,
            message: `Seal ${seal.seal_number} has been revoked and recorded on block #${revBlock.block_height}.`,
            seal_number: seal.seal_number,
            status: 'REVOKED',
            revocation_block: revBlock.block_height,
            revoked_at: now
        });
    } catch (error) {
        console.error('Revoke Seal Error:', error);
        return res.status(500).json({ success: false, error: 'Failed to revoke seal.' });
    }
}

/**
 * List seals based on user role
 * GET /api/seals
 */
function getSeals(req, res) {
    try {
        let seals = [];
        if (req.user.role === 'admin') {
            seals = db.prepare('SELECT * FROM seals ORDER BY id DESC LIMIT 100').all();
        } else if (req.user.role === 'issuer') {
            seals = db.prepare('SELECT * FROM seals WHERE issuer_id = ? ORDER BY id DESC').all(req.user.id);
        } else {
            seals = db.prepare('SELECT * FROM seals WHERE recipient_email = ? ORDER BY id DESC').all(req.user.email);
        }

        return res.json({
            success: true,
            count: seals.length,
            seals: seals.map(s => {
                let meta = {};
                try { meta = JSON.parse(s.metadata || '{}'); } catch (_) {}
                return { ...s, metadata: meta };
            })
        });
    } catch (error) {
        console.error('Get Seals Error:', error);
        return res.status(500).json({ success: false, error: 'Failed to retrieve seals.' });
    }
}

module.exports = {
    issueSeal,
    verifySeal,
    revokeSeal,
    getSeals
};
