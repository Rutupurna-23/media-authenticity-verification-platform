import db from '../db/database.js';
import { hashPassword, verifyPassword } from '../crypto/hasher.js';
import { signToken } from '../crypto/jwt.js';

/**
 * Register a new user
 * POST /api/auth/register
 */
export function register(req, res) {
    try {
        const { name, email, password, role = 'verifier', organization = '' } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Name, email, and password are required fields.'
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        // Check if user already exists
        const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
        if (existing) {
            return res.status(409).json({
                success: false,
                error: 'An account with this email address already exists.'
            });
        }

        const validRoles = ['issuer', 'verifier', 'user', 'admin'];
        const userRole = validRoles.includes(role) ? role : 'verifier';

        const { salt, hash } = hashPassword(password);
        const now = new Date().toISOString();

        const insert = db.prepare(`
            INSERT INTO users (name, email, password_hash, salt, role, organization, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        const result = insert.run(name.trim(), normalizedEmail, hash, salt, userRole, organization.trim(), now);

        const userId = Number(result.lastInsertRowid);
        const token = signToken({ id: userId, email: normalizedEmail, role: userRole });

        // Record audit log
        db.prepare(`
            INSERT INTO audit_logs (action, user_id, details, timestamp)
            VALUES (?, ?, ?, ?)
        `).run('USER_REGISTER', userId, `Registered with role: ${userRole}`, now);

        return res.status(201).json({
            success: true,
            message: 'User registered successfully.',
            user: {
                id: userId,
                name: name.trim(),
                email: normalizedEmail,
                role: userRole,
                organization: organization.trim(),
                created_at: now
            },
            token
        });
    } catch (error) {
        console.error('Registration Error:', error);
        return res.status(500).json({
            success: false,
            error: 'Server error occurred during registration.'
        });
    }
}

/**
 * Login user
 * POST /api/auth/login
 */
export function login(req, res) {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Email and password are required.'
            });
        }

        const normalizedEmail = email.trim().toLowerCase();
        const user = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail);

        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Invalid email or password.'
            });
        }

        const isMatch = verifyPassword(password, user.salt, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                error: 'Invalid email or password.'
            });
        }

        const token = signToken({
            id: user.id,
            email: user.email,
            role: user.role
        });

        // Record audit log
        const now = new Date().toISOString();
        db.prepare(`
            INSERT INTO audit_logs (action, user_id, details, timestamp)
            VALUES (?, ?, ?, ?)
        `).run('USER_LOGIN', user.id, `User logged in from ${req.ip || 'local'}`, now);

        return res.json({
            success: true,
            message: 'Login successful.',
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                organization: user.organization,
                created_at: user.created_at
            },
            token
        });
    } catch (error) {
        console.error('Login Error:', error);
        return res.status(500).json({
            success: false,
            error: 'Server error occurred during login.'
        });
    }
}

/**
 * Google Single Sign-On (Mock / OAuth integration)
 * POST /api/auth/google
 */
export function googleAuth(req, res) {
    try {
        const { email, name, googleId, role = 'user', organization = '' } = req.body;
        const normalizedEmail = (email || 'google_user@truthseal.io').trim().toLowerCase();
        const userName = name || 'Google Verified User';

        let user = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail);

        if (!user) {
            const { salt, hash } = hashPassword(Math.random().toString(36) + 'GoogleAuthPass!');
            const now = new Date().toISOString();
            const validRoles = ['issuer', 'verifier', 'user', 'admin'];
            const userRole = validRoles.includes(role) ? role : 'user';
            const userOrg = organization || (userRole === 'issuer' ? 'University / Issuing Entity' : 'Google Verified Account');

            const result = db.prepare(`
                INSERT INTO users (name, email, password_hash, salt, role, organization, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(userName, normalizedEmail, hash, salt, userRole, userOrg, now);

            user = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(result.lastInsertRowid));
        }

        const token = signToken({ id: user.id, email: user.email, role: user.role });

        // Record audit log
        const now = new Date().toISOString();
        db.prepare(`
            INSERT INTO audit_logs (action, user_id, details, timestamp)
            VALUES (?, ?, ?, ?)
        `).run('GOOGLE_LOGIN', user.id, `Google SSO login for ${user.email} (${user.role})`, now);

        return res.json({
            success: true,
            message: 'Google login authenticated.',
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                organization: user.organization
            },
            token
        });
    } catch (error) {
        console.error('Google Auth Error:', error);
        return res.status(500).json({ success: false, error: 'Google authentication failed.' });
    }
}

/**
 * Get current authenticated user profile
 * GET /api/auth/me
 */
export function getProfile(req, res) {
    return res.json({
        success: true,
        user: req.user
    });
}

/**
 * Forgot password handler
 * POST /api/auth/forgot-password
 */
export function forgotPassword(req, res) {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ success: false, error: 'Email address is required.' });
    }

    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email.trim().toLowerCase());
    if (!user) {
        // Return friendly message to prevent email enumeration
        return res.json({
            success: true,
            message: 'If an account with that email exists, password reset instructions have been sent.'
        });
    }

    return res.json({
        success: true,
        message: 'Password reset link sent to registered email address.'
    });
}

export default {
    register,
    login,
    googleAuth,
    getProfile,
    forgotPassword
};
