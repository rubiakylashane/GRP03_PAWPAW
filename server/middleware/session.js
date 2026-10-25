const crypto = require('crypto');
const db = require('../config/db');

const COOKIE_NAME = 'pawpaw_session';
const SESSION_SECONDS = 60 * 60 * 8;

function normalizeRole(value) {
  const role = String(value || '').trim().toLowerCase().replace(/[_-]+/g, ' ');
  if (['owner', 'pet owner'].includes(role)) return 'owner';
  if (['staff', 'clinic staff'].includes(role)) return 'staff';
  if (['vet', 'veterinarian'].includes(role)) return 'vet';
  if (['admin', 'administrator'].includes(role)) return 'admin';
  return '';
}

function cookieValue(req) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === COOKIE_NAME) return value.join('=');
  }
  return '';
}

function writeCookie(res, value, maxAge) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${value}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure}`);
}

function issueSession(res, userId, role) {
  const normalizedRole = normalizeRole(role);
  if (!normalizedRole) throw new Error('Unsupported account role.');
  const token = crypto.randomBytes(32).toString('base64url');
  return db.query(
    `INSERT INTO auth_session (token_hash, user_id, role, expires_at)
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP + INTERVAL '8 hours')`,
    [crypto.createHash('sha256').update(token).digest('hex'), userId, normalizedRole]
  ).then(() => {
    writeCookie(res, token, SESSION_SECONDS);
  });
}

function clearSession(res) {
  writeCookie(res, '', 0);
}

async function requireSession(req, res, next) {
  const token = cookieValue(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  try {
    const result = await db.query(
      `SELECT s.user_id, s.role, ua.role AS account_role
       FROM auth_session s
       JOIN user_account ua ON ua.user_id = s.user_id
       WHERE s.token_hash = $1
         AND s.expires_at > CURRENT_TIMESTAMP
         AND ua.account_status = 'Active'`,
      [crypto.createHash('sha256').update(token).digest('hex')]
    );
    const session = result.rows[0];
    const accountRole = session && normalizeRole(session.account_role);
    if (!session || !accountRole || accountRole !== session.role) {
      await revokeSession(req, res);
      return res.status(401).json({ error: 'Authentication required.' });
    }
    req.auth = { userId: session.user_id, role: accountRole };
    next();
  } catch (error) {
    console.error('Session authentication failed:', error);
    res.status(500).json({ error: 'Could not validate the sign-in session.' });
  }
}

async function revokeSession(req, res) {
  const token = cookieValue(req);
  if (token) {
    await db.query(
      'DELETE FROM auth_session WHERE token_hash = $1',
      [crypto.createHash('sha256').update(token).digest('hex')]
    );
  }
  clearSession(res);
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.auth) return res.status(401).json({ error: 'Authentication required.' });
    if (!roles.includes(req.auth.role)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    }
    next();
  };
}

module.exports = {
  clearSession,
  issueSession,
  normalizeRole,
  revokeSession,
  requireRole,
  requireSession
};
