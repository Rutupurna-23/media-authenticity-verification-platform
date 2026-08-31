import express from 'express';
import ledgerController from '../controllers/ledgerController.js';

const router = express.Router();

// Public blockchain explorer routes
router.get('/blocks', ledgerController.getBlocks);
router.get('/blocks/:height', ledgerController.getBlockByHeight);
router.get('/stats', ledgerController.getStats);

export default router;
