import jwt from 'jsonwebtoken';
import { db } from './db.js';

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

export function signToken(member) {
  return jwt.sign({ id: member.id, username: member.username, role: member.role, designation: member.designation || '' }, SECRET, {
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

function isAdminMember(member) {
  if (!member) return false;
  if (member.role === 'admin') return true;
  return false;
}

export function requireAdmin(req, res, next) {
  // Also refresh from DB in case designation/role changed
  if (req.member?.id) {
    try {
      const fresh = db.prepare('SELECT role, designation FROM members WHERE id = ?').get(req.member.id);
      if (fresh) {
        req.member.role = fresh.role;
        req.member.designation = fresh.designation || '';
      }
    } catch {}
  }
  if (!isAdminMember(req.member)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

export { isAdminMember };