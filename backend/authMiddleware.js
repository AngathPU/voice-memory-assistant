const jwt = require('jsonwebtoken');

if (!process.env.JWT_SECRET) {
  console.error('❌ JWT_SECRET is not set. Add it to your .env file.');
  process.exit(1);
}

// Reads "Authorization: Bearer <token>", verifies it, and attaches
// req.userId for downstream routes to use. Rejects with 401 if missing/invalid.
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.userId;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { requireAuth };
