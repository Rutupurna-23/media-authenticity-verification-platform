import express from 'express';
import multer from 'multer';
import sealController from '../controllers/sealController.js';
import { requireAuth, requireRole } from '../middleware/authMiddleware.js';

const router = express.Router();

// Multer in-memory storage for document file hashing
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 } // 50 MB max
});

// Public verification routes
router.get('/verify/:sealNumber', sealController.verifySeal);
router.post('/verify', upload.single('document'), sealController.verifySeal);

// Protected routes
router.get('/', requireAuth, sealController.getSeals);
router.post('/issue', requireAuth, requireRole('issuer', 'admin'), upload.single('document'), sealController.issueSeal);
router.post('/revoke', requireAuth, requireRole('issuer', 'admin'), sealController.revokeSeal);

export default router;
