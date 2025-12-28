// server/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const { createEvent } = require('./events');
const store = require('./store');
const { createMailer } = require('./mailer');
const { requireApiKey, rateLimit } = require('./guards');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY;
const APP_MODE = process.env.APP_MODE || 'prototype';

if (APP_MODE !== 'prototype') {
  throw new Error('Server is prototype-only');
}

const mailer = createMailer(process.env);

// --- Routes

app.post(
  '/moncash',
  requireApiKey(API_KEY),
  rateLimit({ max: 20 }),
  async (req, res) => {
    try {
      const { to, amount, ref } = req.body || {};
      if (!to || !amount) {
        return res.status(400).json({ ok: false, message: "'to' and 'amount' required" });
      }

      const ev = createEvent({
        kind: 'MONCASH',
        actor: to,
        amount,
        ref,
        note: 'Inbound MonCash (simulated)',
        source: 'server'
      });

      await store.append(ev);

      // notify admin
      await mailer.send({
        to: process.env.ADMIN_EMAIL,
        subject: `MonCash reçu: ${ev.amount} → ${ev.actor}`,
        html: `
          <h3>MonCash reçu</h3>
          <p><strong>Destinataire:</strong> ${ev.actor}</p>
          <p><strong>Montant:</strong> ${ev.amount} ${ev.currency}</p>
          <p><strong>Réf:</strong> ${ev.ref}</p>
          <small>${ev.createdAt}</small>
        `
      });

      return res.json({ ok: true, event: ev });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ ok: false, message: 'server error' });
    }
  }
);

app.post(
  '/notify/signup',
  requireApiKey(API_KEY),
  rateLimit({ max: 20 }),
  async (req, res) => {
    try {
      const { name, email } = req.body || {};
      if (!name || !email) {
        return res.status(400).json({ ok: false, message: "'name' and 'email' required" });
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
          <p><strong>Nom:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          <small>${ev.createdAt}</small>
        `
      });

      return res.json({ ok: true });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ ok: false, message: 'server error' });
    }
  }
);

app.get('/events', requireApiKey(API_KEY), async (req, res) => {
  const list = await store.list({ limit: 200 });
  res.json(list);
});

app.listen(PORT, () =>
  console.log(`TiKochon server (prototype) listening on ${PORT}`)
);
