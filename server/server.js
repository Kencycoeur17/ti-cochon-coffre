// server/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const { createEvent, cleanEmail, cleanAmount } = require('./events');
const store = require('./store');
const { createMailer } = require('./mailer');
const { requireApiKey, rateLimit } = require('./guards');
const { computeBalance } = require('./ledger');

const app = express();

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY;
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

function htmlEscape(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function validateEmail(email) {
  const normalized = cleanEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error('Invalid email');
  }
  return normalized;
}

// --- Routes
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    app: 'ti-cochon-coffre-server',
    mode: APP_MODE,
    mailer: mailer.enabled ? 'enabled' : 'disabled',
    time: new Date().toISOString()
  });
});

app.post(
  '/moncash',
  requireApiKey(API_KEY),
  rateLimit({ max: 20 }),
  async (req, res) => {
    try {
      const to = validateEmail(req.body?.to);
      const amount = cleanAmount(req.body?.amount);
      const ref = String(req.body?.ref || '').trim();

      const ev = createEvent({
        kind: 'MONCASH',
        actor: to,
        amount,
        ref,
        note: 'Inbound MonCash (simulated)',
        source: 'server'
      });

      await store.append(ev);

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
      const isClientError = ['Invalid email', 'Amount must be a positive number'].includes(err.message);
      console.error('[moncash]', err.message);
      return res.status(isClientError ? 400 : 500).json({
        ok: false,
        message: isClientError ? err.message : 'server error'
      });
    }
  }
);

app.post(
  '/notify/signup',
  requireApiKey(API_KEY),
  rateLimit({ max: 20 }),
  async (req, res) => {
    try {
      const name = String(req.body?.name || '').trim();
      const email = validateEmail(req.body?.email);

      if (name.length < 2) {
        return res.status(400).json({ ok: false, message: 'Name is required' });
      }

      const ev = createEvent({
        kind: 'SIGNUP',
        actor: email,
        note: `User signup: ${name}`,
        source: 'server'
      });

      await store.append(ev);

      await mailer.send({
        to: process.env.ADMIN_EMAIL,
        subject: `Nouvelle inscription: ${email}`,
        html: `
          <h3>Nouveau compte</h3>
          <p><strong>Nom:</strong> ${htmlEscape(name)}</p>
          <p><strong>Email:</strong> ${htmlEscape(email)}</p>
          <small>${htmlEscape(ev.createdAt)}</small>
        `
      });

      return res.json({ ok: true });
    } catch (err) {
      const isClientError = err.message === 'Invalid email';
      console.error('[signup]', err.message);
      return res.status(isClientError ? 400 : 500).json({
        ok: false,
        message: isClientError ? err.message : 'server error'
      });
    }
  }
);

app.get('/ledger/:email', requireApiKey(API_KEY), async (req, res) => {
  try {
    const email = validateEmail(req.params.email);
    const events = await store.list({ limit: 5000 });
    const balance = computeBalance(events, email);

    return res.json({
      ok: true,
      email,
      balance,
      currency: 'USD',
      computedAt: new Date().toISOString()
    });
  } catch (err) {
    return res.status(400).json({ ok: false, message: err.message });
  }
});

app.use((req, res) => {
  res.status(404).json({ ok: false, message: 'Route not found' });
});

app.listen(PORT, () => {
  console.log(`Ti Cochon Coffre prototype server running on port ${PORT}`);
});