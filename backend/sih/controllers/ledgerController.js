import db from '../db/database.js';
import { verifyChainIntegrity, getRecentBlocks } from '../crypto/blockchain.js';

/**
 * Get recent blockchain blocks
 * GET /api/ledger/blocks
 */
export function getBlocks(req, res) {
    try {
        const limit = parseInt(req.query.limit) || 20;
        const blocks = getRecentBlocks(limit);
        return res.json({
            success: true,
            total: blocks.length,
            blocks
        });
    } catch (error) {
        console.error('Ledger Blocks Error:', error);
        return res.status(500).json({ success: false, error: 'Failed to retrieve blockchain blocks.' });
    }
}

/**
 * Get single block by height
 * GET /api/ledger/blocks/:height
 */
export function getBlockByHeight(req, res) {
    try {
        const height = parseInt(req.params.height);
        const block = db.prepare('SELECT * FROM blockchain WHERE block_height = ?').get(height);
        if (!block) {
            return res.status(404).json({ success: false, error: `Block #${height} not found.` });
        }

        // Get seals anchored in this block
        const seals = db.prepare('SELECT seal_number, doc_name, recipient_name, status, issued_at FROM seals WHERE block_height = ?').all(height);

        return res.json({
            success: true,
            block: {
                ...block,
                anchored_seals: seals
            }
        });
    } catch (error) {
        console.error('Get Block Error:', error);
        return res.status(500).json({ success: false, error: 'Failed to retrieve block.' });
    }
}

/**
 * Get platform stats and cryptographic health
 * GET /api/ledger/stats
 */
export function getStats(req, res) {
    try {
        const totalSeals = db.prepare('SELECT COUNT(*) as count FROM seals').get().count;
        const activeSeals = db.prepare("SELECT COUNT(*) as count FROM seals WHERE status = 'ACTIVE'").get().count;
        const revokedSeals = db.prepare("SELECT COUNT(*) as count FROM seals WHERE status = 'REVOKED'").get().count;
        const totalVerifications = db.prepare('SELECT COUNT(*) as count FROM verifications').get().count;
        const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;

        const chainIntegrity = verifyChainIntegrity();

        return res.json({
            success: true,
            stats: {
                total_seals: totalSeals,
                active_seals: activeSeals,
                revoked_seals: revokedSeals,
                total_verifications: totalVerifications,
                total_registered_entities: totalUsers,
                blockchain_height: chainIntegrity.tip_height,
                chain_validity: chainIntegrity.valid ? 'IMMUTABLE_AND_VALID' : 'INTEGRITY_COMPROMISED',
                latest_block_hash: chainIntegrity.tip_hash
            }
        });
    } catch (error) {
        console.error('Ledger Stats Error:', error);
        return res.status(500).json({ success: false, error: 'Failed to retrieve ledger statistics.' });
    }
}

export default {
    getBlocks,
    getBlockByHeight,
    getStats
};
