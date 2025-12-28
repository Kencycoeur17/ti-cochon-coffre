// server/ledger.js
function computeBalance(events, email) {
  const e = email.toLowerCase();
  let balance = 0;

  for (const ev of events) {
    if (ev.kind === 'SEED' && ev.actor === e) {
      balance += ev.amount || 0;
    }

    if ((ev.kind === 'DEPOSIT' || ev.kind === 'MONCASH') && ev.actor === e) {
      balance += ev.amount || 0;
    }

    if (ev.kind === 'WITHDRAW' && ev.actor === e) {
      balance -= ev.amount || 0;
    }

    if (ev.kind === 'P2P') {
      if (ev.actor === e) balance -= ev.amount || 0;
      if (ev.counterparty === e) balance += ev.amount || 0;
    }
  }

  return Math.round(balance * 100) / 100;
}

module.exports = { computeBalance };
