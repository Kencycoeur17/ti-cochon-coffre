// server/events.js
const { v4: uuidv4 } = require('uuid');

function nowISO() {
  return new Date().toISOString();
}

/**
 * Event model (aligné front)
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
  if (!kind || !actor) {
    throw new Error('Event requires kind and actor');
  }

  return {
    id: uuidv4(),
    kind,
    actor: String(actor).toLowerCase(),
    counterparty: counterparty ? String(counterparty).toLowerCase() : undefined,
    amount: amount === undefined ? undefined : Number(amount),
    currency,
    ref: ref || `${kind}-${Date.now()}`,
    note: note || '',
    createdAt: nowISO(),
    source
  };
}

module.exports = { createEvent };
