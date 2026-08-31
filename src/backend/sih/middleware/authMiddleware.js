const { verifyToken } = require('../crypto/jwt');
const db = require('../db/database');

/**
 * Authentication middleware that validates JWT tokens
 */
function requireAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    let token = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7).trim();
    } else if (req.query && req.query.token) {
        token = req.query.token;
    }

    if (!token) {
        return res.status(401).json({
            success: false,
            error: 'Authentication required. Please provide a valid Bearer token.'
        });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
        return res.status(401).json({
            success: false,
            error: 'Invalid or expired session token.'
        });
    }

    // Verify user still exists in database
    const user = db.prepare('SELECT id, name, email, role, organization FROM users WHERE id = ?').get(decoded.id);
    if (!user) {
        return res.status(401).json({
            success: false,
            error: 'User account not found.'
        });
    }

    req.user = user;
    next();
}

/**
 * Middleware factory for role-based authorization
 * @param  {...string} allowedRoles - e.g. 'issuer', 'admin'
 */
function requireRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, error: 'Authentication required.' });
        }

        if (!allowedRoles.includes(req.user.role) && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: `Access denied. Requires one of roles: [${allowedRoles.join(', ')}]. Current role: '${req.user.role}'`
            });
        }

        next();
    };
}

module.exports = {
    requireAuth,
    requireRole
};
