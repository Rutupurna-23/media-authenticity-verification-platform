const express = require('express');
const router = express.Router();
const multer = require('multer');
const sealController = require('../controllers/sealController');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');

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

module.exports = router;
