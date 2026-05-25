// server/admin.js
const { all, get } = require('./db');

function requireAdmin(adminToken) {
  return function (req, res, next) {
    const token = req.headers['x-admin-token'] || '';

    if (!adminToken || token !== adminToken) {
      return res.status(401).json({ ok: false, message: 'Invalid admin token' });
    }

    next();
  };
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function applyEvent(balance, ev, email) {
  if (ev.status !== 'confirmed') return balance;
  const amount = Math.abs(Number(ev.amount || 0));

  if (['SEED', 'DEPOSIT', 'MONCASH'].includes(ev.kind) && ev.actor_email === email) return balance + amount;
  if (ev.kind === 'WITHDRAW' && ev.actor_email === email) return balance - amount;

  if (ev.kind === 'P2P') {
    if (ev.actor_email === email) return balance - amount;
    if (ev.counterparty_email === email) return balance + amount;
  }

  return balance;
}

function toPublicUser(row, balance = 0) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    balance: roundMoney(balance),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
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
    idempotencyKey: row.idempotency_key || undefined,
    createdAt: row.created_at
  };
}

async function listAdminUsers({ limit = 100 } = {}) {
  const users = await all(
    `SELECT id, name, email, created_at, updated_at
     FROM users
     ORDER BY created_at DESC
     LIMIT ?`,
    [Number(limit) || 100]
  );

  const events = await all('SELECT * FROM ledger_events WHERE status = ? ORDER BY created_at ASC', ['confirmed']);

  return users.map((user) => {
    const balance = events.reduce((sum, ev) => applyEvent(sum, ev, user.email), 0);
    return toPublicUser(user, balance);
  });
}

async function listAdminTransactions({ limit = 100 } = {}) {
  const rows = await all(
    `SELECT * FROM ledger_events
     ORDER BY created_at DESC
     LIMIT ?`,
    [Number(limit) || 100]
  );

  return rows.map(toPublicEvent);
}

async function getAdminSummary() {
  const userCount = await get('SELECT COUNT(*) as count FROM users');
  const sessionCount = await get('SELECT COUNT(*) as count FROM sessions WHERE revoked_at IS NULL AND expires_at > datetime("now")');
  const txCount = await get('SELECT COUNT(*) as count FROM ledger_events');
  const confirmedTxCount = await get('SELECT COUNT(*) as count FROM ledger_events WHERE status = ?', ['confirmed']);
  const volume = await get(
    `SELECT COALESCE(SUM(amount), 0) as amount
     FROM ledger_events
     WHERE status = 'confirmed' AND kind IN ('DEPOSIT','MONCASH','P2P','WITHDRAW')`
  );

  const users = await listAdminUsers({ limit: 10000 });
  const totalBalance = users.reduce((sum, user) => sum + Number(user.balance || 0), 0);

  return {
    users: Number(userCount?.count || 0),
    activeSessions: Number(sessionCount?.count || 0),
    transactions: Number(txCount?.count || 0),
    confirmedTransactions: Number(confirmedTxCount?.count || 0),
    totalVolume: roundMoney(volume?.amount || 0),
    totalBalance: roundMoney(totalBalance),
    currency: 'USD',
    generatedAt: new Date().toISOString()
  };
}

module.exports = {
  requireAdmin,
  getAdminSummary,
  listAdminUsers,
  listAdminTransactions
};
