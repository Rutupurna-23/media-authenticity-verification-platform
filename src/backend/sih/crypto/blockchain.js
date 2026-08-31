const db = require('../db/database');
const { sha256, calculateMerkleRoot } = require('./hasher');
const config = require('../config');

/**
 * Get latest block in the blockchain
 */
function getLatestBlock() {
    return db.prepare('SELECT * FROM blockchain ORDER BY block_height DESC LIMIT 1').get();
}

/**
 * Mine and record a new block into the immutable ledger
 * @param {Array<string>} txHashes - Array of transaction/seal hashes included in this block
 */
function createBlock(txHashes) {
    const latestBlock = getLatestBlock();
    const newHeight = (latestBlock ? latestBlock.block_height : 0) + 1;
    const prevHash = latestBlock ? latestBlock.hash : '0000000000000000000000000000000000000000000000000000000000000000';
    const merkleRoot = calculateMerkleRoot(txHashes);
    const timestamp = Date.now();
    const dataCount = txHashes.length;

    // Simple proof of work nonce calculation
    let nonce = 0;
    let blockHash = '';
    const prefix = '0'.repeat(config.CHAIN_DIFFICULTY);

    while (true) {
        blockHash = sha256(`${newHeight}:${prevHash}:${merkleRoot}:${timestamp}:${nonce}`);
        if (blockHash.startsWith(prefix)) {
            break;
        }
        nonce++;
        if (nonce > 100000) break; // fallback safety
    }

    db.prepare(`
        INSERT INTO blockchain (block_height, prev_hash, merkle_root, data_count, timestamp, nonce, hash)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(newHeight, prevHash, merkleRoot, dataCount, timestamp, nonce, blockHash);

    return {
        block_height: newHeight,
        prev_hash: prevHash,
        merkle_root: merkleRoot,
        data_count: dataCount,
        timestamp,
        nonce,
        hash: blockHash
    };
}

/**
 * Validate full blockchain integrity from genesis to current tip
 */
function verifyChainIntegrity() {
    const blocks = db.prepare('SELECT * FROM blockchain ORDER BY block_height ASC').all();
    if (!blocks || blocks.length === 0) return { valid: false, error: 'Empty chain' };

    for (let i = 1; i < blocks.length; i++) {
        const current = blocks[i];
        const previous = blocks[i - 1];

        // Check hash linkage
        if (current.prev_hash !== previous.hash) {
            return {
                valid: false,
                error: `Broken chain link at block #${current.block_height}. Expected prev_hash: ${previous.hash}, found: ${current.prev_hash}`
            };
        }

        // Check current block hash validity
        const recalculated = sha256(`${current.block_height}:${current.prev_hash}:${current.merkle_root}:${current.timestamp}:${current.nonce}`);
        if (recalculated !== current.hash) {
            return {
                valid: false,
                error: `Tampered block data at block #${current.block_height}. Recorded hash mismatch.`
            };
        }
    }

    return {
        valid: true,
        total_blocks: blocks.length,
        tip_hash: blocks[blocks.length - 1].hash,
        tip_height: blocks[blocks.length - 1].block_height
    };
}

/**
 * Get recent blocks for explorer
 */
function getRecentBlocks(limit = 10) {
    return db.prepare('SELECT * FROM blockchain ORDER BY block_height DESC LIMIT ?').all(limit);
}

module.exports = {
    getLatestBlock,
    createBlock,
    verifyChainIntegrity,
    getRecentBlocks
};
