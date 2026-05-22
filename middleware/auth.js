/**
 * StreamCast - JWT Authentication Middleware
 * 
 * Extracts and verifies JWT tokens from the Authorization header.
 * On success, attaches the decoded user object to req.user.
 * Returns 401 for missing tokens and 403 for invalid/expired tokens.
 */

const jwt = require('jsonwebtoken');

// Secret key for signing and verifying JWT tokens
const JWT_SECRET = 'streamcast-secret-key-2024';

/**
 * Express middleware that validates JWT Bearer tokens.
 * Usage: router.get('/protected', authMiddleware, handler)
 */
function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];

    // Check if Authorization header is present
    if (!authHeader) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'No authorization header provided. Use: Authorization: Bearer <token>'
      });
    }

    // Expect "Bearer <token>" format
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({
        error: 'Invalid token format',
        message: 'Authorization header must use Bearer scheme: Bearer <token>'
      });
    }

    const token = parts[1];

    // Verify the token and decode the payload
    const decoded = jwt.verify(token, JWT_SECRET);

    // Attach user data to the request object for downstream handlers
    req.user = {
      id: decoded.id,
      email: decoded.email,
      name: decoded.name,
      plan: decoded.plan
    };

    next();
  } catch (err) {
    // Handle specific JWT errors with helpful messages
    if (err.name === 'TokenExpiredError') {
      return res.status(403).json({
        error: 'Token expired',
        message: 'Your session has expired. Please log in again.'
      });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(403).json({
        error: 'Invalid token',
        message: 'The provided token is invalid.'
      });
    }
    return res.status(500).json({
      error: 'Authentication error',
      message: 'An error occurred during authentication.'
    });
  }
}

// Export the secret for use in route handlers when signing tokens
module.exports = authMiddleware;
module.exports.JWT_SECRET = JWT_SECRET;
