// server/events.js
const crypto = require('crypto');

function nowISO() {
  return new Date().toISOString();
}

function eventId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `ev_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
}

function cleanEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function cleanAmount(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error('Amount must be a positive number');
  }
  return Math.round(n * 100) / 100;
}

/**
 * Event model aligned with the frontend prototype.
 * Important: this is still prototype-grade, not a production financial ledger.
 */
function createEvent({
  kind,
  actor,
  counterparty,
  amount,
  currency = 'USD',
  ref,
  note,
  source = 'server'
}) {
  const normalizedKind = String(kind || '').trim().toUpperCase();
  const normalizedActor = cleanEmail(actor);

  if (!normalizedKind || !normalizedActor) {
    throw new Error('Event requires kind and actor');
  }

  return {
    id: eventId(),
    kind: normalizedKind,
    actor: normalizedActor,
    counterparty: counterparty ? cleanEmail(counterparty) : undefined,
    amount: amount === undefined ? undefined : cleanAmount(amount),
    currency,
    ref: String(ref || `${normalizedKind}-${Date.now()}`).trim(),
    note: String(note || '').trim(),
    createdAt: nowISO(),
    source
  };
}

module.exports = { createEvent, cleanEmail, cleanAmount };