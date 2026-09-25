import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

export function signToken(member) {
  return jwt.sign({ id: member.id, username: member.username, role: member.role }, SECRET, {
    expiresIn: '7d',
  });
}

export function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    req.member = verifyToken(token);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireAdmin(req, res, next) {
  if (req.member?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}