// server/sqlite-ledger.js
const crypto = require('crypto');
const { run, all } = require('./db');
const { cleanEmail } = require('./auth');

function nowISO() {
  return new Date().toISOString();
}

function eventId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `evt_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
}

function amountOrUndefined(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new Error('Amount must be a positive number');
  return Math.round(n * 100) / 100;
}

function normalizeKind(kind) {
  const k = String(kind || '').trim().toUpperCase();
  const allowed = ['SEED', 'SIGNUP', 'LOGIN', 'DEPOSIT', 'WITHDRAW', 'P2P', 'MONCASH'];
  if (!allowed.includes(k)) throw new Error('Invalid event kind');
  return k;
}

function normalizeStatus(status) {
  const s = String(status || 'confirmed').trim().toLowerCase();
  const allowed = ['pending', 'confirmed', 'failed', 'reversed'];
  if (!allowed.includes(s)) throw new Error('Invalid event status');
  return s;
}

async function createLedgerEvent({
  kind,
  actorEmail,
  counterpartyEmail,
  amount,
  currency = 'USD',
  ref,
  note,
  status = 'confirmed',
  source = 'server',
  idempotencyKey
}) {
  const ev = {
    id: eventId(),
    kind: normalizeKind(kind),
    actor_email: cleanEmail(actorEmail),
    counterparty_email: counterpartyEmail ? cleanEmail(counterpartyEmail) : null,
    amount: amountOrUndefined(amount),
    currency,
    ref: String(ref || `${kind}-${Date.now()}`).trim(),
    note: String(note || '').trim(),
    status: normalizeStatus(status),
    source: String(source || 'server').trim(),
    idempotency_key: idempotencyKey ? String(idempotencyKey).trim() : null,
    created_at: nowISO()
  };

  if (!ev.actor_email) throw new Error('Actor email is required');

  await run(
    `INSERT INTO ledger_events
      (id, kind, actor_email, counterparty_email, amount, currency, ref, note, status, source, idempotency_key, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      ev.id,
      ev.kind,
      ev.actor_email,
      ev.counterparty_email,
      ev.amount,
      ev.currency,
      ev.ref,
      ev.note,
      ev.status,
      ev.source,
      ev.idempotency_key,
      ev.created_at
    ]
  );

  return toPublicEvent(ev);
}

function toPublicEvent(row) {
  return {
    id: row.id,
    kind: row.kind,
    actor: row.actor_email,
    counterparty: row.counterparty_email || undefined,
    amount: row.amount === null || row.amount === undefined ? undefined : Number(row.amount),
    currency: row.currency || 'USD',
    ref: row.ref,
    note: row.note || '',
    status: row.status,
    source: row.source,
    createdAt: row.created_at
  };
}

function applyEvent(balance, ev, email) {
  if (ev.status !== 'confirmed') return balance;
  const amount = Math.abs(Number(ev.amount || 0));

  if (['SEED', 'DEPOSIT', 'MONCASH'].includes(ev.kind) && ev.actor_email === email) {
    return balance + amount;
  }

  if (ev.kind === 'WITHDRAW' && ev.actor_email === email) {
    return balance - amount;
  }

  if (ev.kind === 'P2P') {
    if (ev.actor_email === email) return balance - amount;
    if (ev.counterparty_email === email) return balance + amount;
  }

  return balance;
}

async function getBalance(email) {
  const e = cleanEmail(email);
  const rows = await all(
    `SELECT * FROM ledger_events
     WHERE actor_email = ? OR counterparty_email = ?
     ORDER BY created_at ASC`,
    [e, e]
  );

  const balance = rows.reduce((sum, ev) => applyEvent(sum, ev, e), 0);
  return Math.round(balance * 100) / 100;
}

async function getHistory(email, limit = 100) {
  const e = cleanEmail(email);
  const rows = await all(
    `SELECT * FROM ledger_events
     WHERE actor_email = ? OR counterparty_email = ?
     ORDER BY created_at DESC
     LIMIT ?`,
    [e, e, Number(limit) || 100]
  );

  return rows.map(toPublicEvent);
}

module.exports = {
  createLedgerEvent,
  getBalance,
  getHistory,
  toPublicEvent
};
