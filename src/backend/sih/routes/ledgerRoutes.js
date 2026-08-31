const express = require('express');
const router = express.Router();
const ledgerController = require('../controllers/ledgerController');

// Public blockchain explorer routes
router.get('/blocks', ledgerController.getBlocks);
router.get('/blocks/:height', ledgerController.getBlockByHeight);
router.get('/stats', ledgerController.getStats);

module.exports = router;
