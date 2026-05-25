// server/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const { initDb } = require('./db');
const { createMailer } = require('./mailer');
const { requireApiKey, rateLimit } = require('./guards');
const {
  createUser,
  loginUser,
  revokeSession,
  requireAuth,
  bearerToken,
  validateEmail
} = require('./auth');
const { createLedgerEvent, getBalance, getHistory } = require('./sqlite-ledger');
const {
  requireAdmin,
  getAdminSummary,
  listAdminUsers,
  listAdminTransactions
} = require('./admin');

const app = express();

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const APP_MODE = process.env.APP_MODE || 'prototype';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

if (APP_MODE !== 'prototype') {
  throw new Error('Server is prototype-only. Set APP_MODE=prototype for local/demo use.');
}

app.use(
  cors({
    origin: ALLOWED_ORIGIN === '*' ? true : ALLOWED_ORIGIN,
    credentials: false
  })
);
app.use(express.json({ limit: '64kb' }));

const mailer = createMailer(process.env);
const adminOnly = requireAdmin(ADMIN_TOKEN);

function htmlEscape(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function amount(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new Error('Amount must be a positive number');
  return Math.round(n * 100) / 100;
}

function clientError(res, err, fallback = 'Bad request') {
  const message = err?.message || fallback;
  return res.status(400).json({ ok: false, message });
}

// --- Health
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    app: 'ti-cochon-coffre-server',
    mode: APP_MODE,
    storage: 'sqlite',
    mailer: mailer.enabled ? 'enabled' : 'disabled',
    admin: ADMIN_TOKEN ? 'enabled' : 'disabled',
    time: new Date().toISOString()
  });
});

// --- Auth routes
app.post('/auth/signup', rateLimit({ max: 12 }), async (req, res) => {
  try {
    const user = await createUser({
      name: req.body?.name,
      email: req.body?.email,
      password: req.body?.password
    });

    await createLedgerEvent({
      kind: 'SIGNUP',
      actorEmail: user.email,
      ref: `SIGNUP-${Date.now()}`,
      note: 'Server signup',
      source: 'server'
    });

    const login = await loginUser({ email: req.body?.email, password: req.body?.password });

    await mailer.send({
      to: process.env.ADMIN_EMAIL,
      subject: `Nouvelle inscription: ${user.email}`,
      html: `
        <h3>Nouveau compte Ti Cochon Coffre</h3>
        <p><strong>Nom:</strong> ${htmlEscape(user.name)}</p>
        <p><strong>Email:</strong> ${htmlEscape(user.email)}</p>
        <small>${htmlEscape(new Date().toISOString())}</small>
      `
    });

    return res.status(201).json({ ok: true, user, session: login.session });
  } catch (err) {
    const status = ['Email already exists', 'Invalid email', 'Name is required', 'Password must contain at least 8 characters'].includes(err.message)
      ? 400
      : 500;
    console.error('[auth/signup]', err.message);
    return res.status(status).json({ ok: false, message: status === 400 ? err.message : 'server error' });
  }
});

app.post('/auth/login', rateLimit({ max: 20 }), async (req, res) => {
  try {
    const result = await loginUser({ email: req.body?.email, password: req.body?.password });

    await createLedgerEvent({
      kind: 'LOGIN',
      actorEmail: result.user.email,
      ref: `LOGIN-${Date.now()}`,
      note: 'Server login',
      source: 'server'
    });

    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[auth/login]', err.message);
    return res.status(401).json({ ok: false, message: 'Invalid credentials' });
  }
});

app.get('/auth/me', requireAuth(), async (req, res) => {
  const balance = await getBalance(req.user.email);
  return res.json({ ok: true, user: req.user, balance, currency: 'USD' });
});

app.post('/auth/logout', requireAuth(), async (req, res) => {
  await revokeSession(bearerToken(req));
  return res.json({ ok: true });
});

// --- Admin routes
app.get('/admin/summary', adminOnly, async (req, res) => {
  const summary = await getAdminSummary();
  return res.json({ ok: true, summary });
});

app.get('/admin/users', adminOnly, async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 100), 1000);
  const users = await listAdminUsers({ limit });
  return res.json({ ok: true, users });
});

app.get('/admin/transactions', adminOnly, async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 100), 1000);
  const events = await listAdminTransactions({ limit });
  return res.json({ ok: true, events });
});

// --- Authenticated wallet routes
app.get('/me/balance', requireAuth(), async (req, res) => {
  const balance = await getBalance(req.user.email);
  return res.json({ ok: true, email: req.user.email, balance, currency: 'USD', computedAt: new Date().toISOString() });
});

app.get('/me/transactions', requireAuth(), async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 100), 500);
  const events = await getHistory(req.user.email, limit);
  return res.json({ ok: true, events });
});

app.post('/transactions/deposit', requireAuth(), rateLimit({ max: 30 }), async (req, res) => {
  try {
    const ev = await createLedgerEvent({
      kind: 'DEPOSIT',
      actorEmail: req.user.email,
      amount: amount(req.body?.amount),
      ref: req.body?.ref || `DEP-${Date.now()}`,
      note: req.body?.note || 'Manual server deposit',
      source: 'server',
      idempotencyKey: req.headers['idempotency-key'] || req.body?.idempotencyKey
    });

    const balance = await getBalance(req.user.email);
    return res.status(201).json({ ok: true, event: ev, balance });
  } catch (err) {
    console.error('[deposit]', err.message);
    return clientError(res, err);
  }
});

app.post('/transactions/withdraw', requireAuth(), rateLimit({ max: 30 }), async (req, res) => {
  try {
    const requested = amount(req.body?.amount);
    const current = await getBalance(req.user.email);
    if (requested > current) return res.status(400).json({ ok: false, message: 'Insufficient balance' });

    const ev = await createLedgerEvent({
      kind: 'WITHDRAW',
      actorEmail: req.user.email,
      amount: requested,
      ref: req.body?.ref || `WIT-${Date.now()}`,
      note: req.body?.note || 'Manual server withdraw',
      source: 'server',
      idempotencyKey: req.headers['idempotency-key'] || req.body?.idempotencyKey
    });

    const balance = await getBalance(req.user.email);
    return res.status(201).json({ ok: true, event: ev, balance });
  } catch (err) {
    console.error('[withdraw]', err.message);
    return clientError(res, err);
  }
});

app.post('/transactions/p2p', requireAuth(), rateLimit({ max: 30 }), async (req, res) => {
  try {
    const to = validateEmail(req.body?.to);
    const requested = amount(req.body?.amount);

    if (to === req.user.email) return res.status(400).json({ ok: false, message: 'Cannot transfer to yourself' });

    const current = await getBalance(req.user.email);
    if (requested > current) return res.status(400).json({ ok: false, message: 'Insufficient balance' });

    const ev = await createLedgerEvent({
      kind: 'P2P',
      actorEmail: req.user.email,
      counterpartyEmail: to,
      amount: requested,
      ref: req.body?.ref || `P2P-${Date.now()}`,
      note: req.body?.note || 'Server P2P transfer',
      source: 'server',
      idempotencyKey: req.headers['idempotency-key'] || req.body?.idempotencyKey
    });

    const balance = await getBalance(req.user.email);
    return res.status(201).json({ ok: true, event: ev, balance });
  } catch (err) {
    console.error('[p2p]', err.message);
    return clientError(res, err);
  }
});

// --- Prototype API-key routes kept for MonCash simulation compatibility
app.post('/moncash', requireApiKey(API_KEY), rateLimit({ max: 20 }), async (req, res) => {
  try {
    const to = validateEmail(req.body?.to);
    const requested = amount(req.body?.amount);
    const ref = String(req.body?.ref || `MC-${Date.now()}`).trim();

    const ev = await createLedgerEvent({
      kind: 'MONCASH',
      actorEmail: to,
      amount: requested,
      ref,
      note: 'Inbound MonCash (simulated)',
      source: 'server',
      idempotencyKey: req.headers['idempotency-key'] || `moncash:${ref}`
    });

    await mailer.send({
      to: process.env.ADMIN_EMAIL,
      subject: `MonCash reçu: ${ev.amount} → ${ev.actor}`,
      html: `
        <h3>MonCash reçu</h3>
        <p><strong>Destinataire:</strong> ${htmlEscape(ev.actor)}</p>
        <p><strong>Montant:</strong> ${htmlEscape(ev.amount)} ${htmlEscape(ev.currency)}</p>
        <p><strong>Réf:</strong> ${htmlEscape(ev.ref)}</p>
        <small>${htmlEscape(ev.createdAt)}</small>
      `
    });

    return res.json({ ok: true, event: ev });
  } catch (err) {
    console.error('[moncash]', err.message);
    return clientError(res, err);
  }
});

app.post('/notify/signup', requireApiKey(API_KEY), rateLimit({ max: 20 }), async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const email = validateEmail(req.body?.email);

    if (name.length < 2) return res.status(400).json({ ok: false, message: 'Name is required' });

    await createLedgerEvent({
      kind: 'SIGNUP',
      actorEmail: email,
      ref: `SIGNUP-${Date.now()}`,
      note: `User signup notification: ${name}`,
      source: 'server'
    });

    await mailer.send({
      to: process.env.ADMIN_EMAIL,
      subject: `Nouvelle inscription: ${email}`,
      html: `
        <h3>Nouveau compte</h3>
        <p><strong>Nom:</strong> ${htmlEscape(name)}</p>
        <p><strong>Email:</strong> ${htmlEscape(email)}</p>
        <small>${htmlEscape(new Date().toISOString())}</small>
      `
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error('[notify/signup]', err.message);
    return clientError(res, err);
  }
});

app.get('/ledger/:email', requireApiKey(API_KEY), async (req, res) => {
  try {
    const email = validateEmail(req.params.email);
    const balance = await getBalance(email);
    const events = await getHistory(email, 200);

    return res.json({
      ok: true,
      email,
      balance,
      events,
      currency: 'USD',
      computedAt: new Date().toISOString()
    });
  } catch (err) {
    return clientError(res, err);
  }
});

app.use((req, res) => {
  res.status(404).json({ ok: false, message: 'Route not found' });
});

async function start() {
  await initDb();
  app.listen(PORT, () => {
    console.log(`Ti Cochon Coffre SQLite MVP server running on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error('[boot]', err);
  process.exit(1);
});