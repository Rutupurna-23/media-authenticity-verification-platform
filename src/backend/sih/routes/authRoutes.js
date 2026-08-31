const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { requireAuth } = require('../middleware/authMiddleware');

// Public routes
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/google', authController.googleAuth);
router.post('/forgot-password', authController.forgotPassword);

// Protected routes
router.get('/me', requireAuth, authController.getProfile);

module.exports = router;
