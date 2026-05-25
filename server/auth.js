// server/auth.js
const crypto = require('crypto');
const { run, get } = require('./db');

const SESSION_DAYS = Number(process.env.SESSION_DAYS || 7);
const PBKDF2_ITERATIONS = Number(process.env.PBKDF2_ITERATIONS || 120000);
const PBKDF2_KEYLEN = 64;
const PBKDF2_DIGEST = 'sha512';

function nowISO() {
  return new Date().toISOString();
}

function futureISO(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function id(prefix = 'id') {
  return `${prefix}_${crypto.randomBytes(16).toString('hex')}`;
}

function cleanEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function validateEmail(email) {
  const normalized = cleanEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error('Invalid email');
  }
  return normalized;
}

function validatePassword(password) {
  const p = String(password || '');
  if (p.length < 8) {
    throw new Error('Password must contain at least 8 characters');
  }
  return p;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST).toString('hex');
  return `pbkdf2$${PBKDF2_ITERATIONS}$${salt}$${derived}`;
}

function verifyPassword(password, storedHash) {
  const parts = String(storedHash || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;

  const iterations = Number(parts[1]);
  const salt = parts[2];
  const expected = parts[3];
  const derived = crypto.pbkdf2Sync(String(password || ''), salt, iterations, expected.length / 2, PBKDF2_DIGEST).toString('hex');

  return crypto.timingSafeEqual(Buffer.from(derived, 'hex'), Buffer.from(expected, 'hex'));
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.created_at
  };
}

async function createUser({ name, email, password }) {
  const safeName = String(name || '').trim();
  if (safeName.length < 2) throw new Error('Name is required');

  const safeEmail = validateEmail(email);
  const safePassword = validatePassword(password);
  const existing = await get('SELECT id FROM users WHERE email = ?', [safeEmail]);
  if (existing) throw new Error('Email already exists');

  const user = {
    id: id('usr'),
    name: safeName,
    email: safeEmail,
    password_hash: hashPassword(safePassword),
    created_at: nowISO(),
    updated_at: nowISO()
  };

  await run(
    `INSERT INTO users (id, name, email, password_hash, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [user.id, user.name, user.email, user.password_hash, user.created_at, user.updated_at]
  );

  return publicUser(user);
}

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const session = {
    token,
    user_id: userId,
    created_at: nowISO(),
    expires_at: futureISO(SESSION_DAYS)
  };

  await run(
    `INSERT INTO sessions (token, user_id, created_at, expires_at)
     VALUES (?, ?, ?, ?)`,
    [session.token, session.user_id, session.created_at, session.expires_at]
  );

  return { token, expiresAt: session.expires_at };
}

async function loginUser({ email, password }) {
  const safeEmail = validateEmail(email);
  const user = await get('SELECT * FROM users WHERE email = ?', [safeEmail]);

  if (!user || !verifyPassword(password, user.password_hash)) {
    throw new Error('Invalid credentials');
  }

  const session = await createSession(user.id);
  return { user: publicUser(user), session };
}

async function findSession(token) {
  if (!token) return null;

  const row = await get(
    `SELECT sessions.token, sessions.expires_at, sessions.revoked_at,
            users.id, users.name, users.email, users.created_at
     FROM sessions
     JOIN users ON users.id = sessions.user_id
     WHERE sessions.token = ?`,
    [token]
  );

  if (!row || row.revoked_at || new Date(row.expires_at).getTime() < Date.now()) return null;

  return {
    token: row.token,
    expiresAt: row.expires_at,
    user: publicUser(row)
  };
}

async function revokeSession(token) {
  if (!token) return false;
  const result = await run('UPDATE sessions SET revoked_at = ? WHERE token = ? AND revoked_at IS NULL', [nowISO(), token]);
  return result.changes > 0;
}

function bearerToken(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return '';
  return header.slice('Bearer '.length).trim();
}

function requireAuth() {
  return async function (req, res, next) {
    try {
      const token = bearerToken(req);
      const session = await findSession(token);

      if (!session) {
        return res.status(401).json({ ok: false, message: 'Unauthorized' });
      }

      req.session = session;
      req.user = session.user;
      next();
    } catch (err) {
      console.error('[auth]', err);
      return res.status(500).json({ ok: false, message: 'auth error' });
    }
  };
}

module.exports = {
  createUser,
  loginUser,
  findSession,
  revokeSession,
  requireAuth,
  bearerToken,
  validateEmail,
  cleanEmail,
  publicUser
};
