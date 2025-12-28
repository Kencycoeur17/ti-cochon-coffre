// === CONFIG (mettre l'URL de ton server si tu veux activer notifications) ===
const SERVER_URL = ''; // ex: 'http://localhost:3000'
const SERVER_API_KEY = ''; // correspond à process.env.API_KEY sur le serveur
const SERVER_URL = 'http://localhost:3000';
const SERVER_API_KEY = 'change-me-super-secret';

// === END CONFIG ===

/* assets/js/app.js
   Ti kochon coffre — client SPA logic
   Data: localStorage (users, events). Session: sessionStorage.
   ✅ Refactor PRO:
   - Ledger central (seule source de vérité pour soldes + événements)
   - Modèle d'événement normalisé
   - Migration automatique des tx legacy (v1) vers events (v2)
*/
document.addEventListener('DOMContentLoaded', () => {
  // --- short selectors
  const $ = (s) => document.querySelector(s);
  const toastEl = $('#toast');
  function toast(msg, ms = 2400) {
    toastEl.textContent = msg;
    toastEl.style.display = 'block';
    setTimeout(() => (toastEl.style.display = 'none'), ms);
  }

  // --- storage keys
  const K_USERS = 'tk_users_v1';
  const K_EVENTS = 'tk_txs_v1'; // on conserve la clé pour compat rétro (migrée en place)
  const K_SESSION = 'tk_session_v1';
  const K_SCHEMA = 'tk_schema_v1';

  // --- utils
  const fauxHash = (p) => btoa(p.split('').reverse().join(''));
  const isoNow = () => new Date().toISOString();
  const rnd = (n = 12) =>
    Array.from(crypto?.getRandomValues?.(new Uint8Array(n)) || Array.from({ length: n }, () => Math.floor(Math.random() * 256)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  const uid = (prefix = 'EV') => `${prefix}-${Date.now()}-${rnd(6)}`;

  function format(n) {
    return '$' + Number(n || 0).toFixed(2);
  }

  // --- API client (proto+)
  function apiEnabled() {
    return Boolean(SERVER_URL && SERVER_API_KEY);
  }

  async function apiPost(path, body, { timeoutMs = 7000 } = {}) {
    if (!apiEnabled()) {
      throw new Error('API disabled');
    }

    const url = SERVER_URL.replace(/\/$/, '') + path;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': SERVER_API_KEY
        },
        body: JSON.stringify(body || {}),
        signal: ctrl.signal
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const msg = data?.message || `HTTP ${res.status}`;
        throw new Error(msg);
      }

      return data;
    } finally {
      clearTimeout(t);
    }
  }

   
  // --- store (isolé)
  const store = {
    users: {
      get() {
        try {
          return JSON.parse(localStorage.getItem(K_USERS) || '[]');
        } catch {
          return [];
        }
      },
      set(list) {
        localStorage.setItem(K_USERS, JSON.stringify(list));
      },
      findByEmail(email) {
        const e = (email || '').toLowerCase();
        return this.get().find((u) => u.email === e) || null;
      },
      upsert(user) {
        const list = this.get();
        const idx = list.findIndex((u) => u.email === user.email);
        if (idx >= 0) list[idx] = user;
        else list.push(user);
        this.set(list);
      }
    },
    events: {
      getRaw() {
        try {
          return JSON.parse(localStorage.getItem(K_EVENTS) || '[]');
        } catch {
          return [];
        }
      },
      set(list) {
        localStorage.setItem(K_EVENTS, JSON.stringify(list));
      }
    },
    schema: {
      get() {
        return localStorage.getItem(K_SCHEMA) || '1';
      },
      set(v) {
        localStorage.setItem(K_SCHEMA, String(v));
      }
    }
  };

  // --- session
  function currentUser() {
    try {
      return JSON.parse(sessionStorage.getItem(K_SESSION) || 'null');
    } catch {
      return null;
    }
  }
  function setCurrent(u) {
    sessionStorage.setItem(K_SESSION, JSON.stringify(u));
    renderSide();
  }
  function clearCurrent() {
    sessionStorage.removeItem(K_SESSION);
    renderSide();
  }

async function fetchServerBalance(email) {
  if (!apiEnabled()) return null;
  try {
    const res = await fetch(
      SERVER_URL.replace(/\/$/, '') + '/ledger/' + encodeURIComponent(email),
      { headers: { 'x-api-key': SERVER_API_KEY } }
    );
    const data = await res.json();
    return data?.balance ?? null;
  } catch {
    return null;
  }
}

   
  // --- Event model (v2)
  // kind: 'SEED' | 'SIGNUP' | 'LOGIN' | 'DEPOSIT' | 'WITHDRAW' | 'P2P' | 'MONCASH'
  // actor: email
  // counterparty?: email
  // amount?: number
  // currency: 'USD'
  // ref: string
  // note?: string
  // createdAt: ISO
  // source: 'client' | 'server'
  function normalizeEvent(ev) {
    // if already in v2 shape, keep but ensure minimal fields
    if (ev && ev.kind && ev.actor && ev.createdAt) {
      return {
        id: ev.id || uid('EV'),
        kind: ev.kind,
        actor: String(ev.actor).toLowerCase(),
        counterparty: ev.counterparty ? String(ev.counterparty).toLowerCase() : undefined,
        amount: ev.amount === undefined ? undefined : Number(ev.amount),
        currency: ev.currency || 'USD',
        ref: ev.ref || uid('REF'),
        note: ev.note || '',
        createdAt: ev.createdAt,
        source: ev.source || 'client'
      };
    }

    // legacy tx (v1)
    const t = ev || {};
    const legacyType = String(t.type || '').toLowerCase();

    const mapKind = {
      seed: 'SEED',
      signup: 'SIGNUP',
      login: 'LOGIN',
      deposit: 'DEPOSIT',
      withdraw: 'WITHDRAW',
      p2p: 'P2P',
      moncash: 'MONCASH'
    };

    const kind = mapKind[legacyType] || 'DEPOSIT';
    const actor = String(t.email || '').toLowerCase();
    const counterparty = t.to ? String(t.to).toLowerCase() : undefined;

    return {
      id: String(t.id || uid('EV')),
      kind,
      actor,
      counterparty,
      amount: t.amount === undefined ? undefined : Number(t.amount),
      currency: 'USD',
      ref: String(t.ref || uid('REF')),
      note: String(t.note || ''),
      createdAt: t.ts || isoNow(),
      source: 'client'
    };
  }

  function migrateLegacyTxsToEvents() {
    // Idempotent: safe to run multiple times
    const raw = store.events.getRaw();
    if (!Array.isArray(raw)) {
      store.events.set([]);
      store.schema.set('2');
      return;
    }

    // If schema already marked 2, still normalize defensively
    const migrated = raw.map(normalizeEvent);

    // Remove obvious duplicates by id (keep first occurrence)
    const seen = new Set();
    const dedup = [];
    for (const ev of migrated) {
      if (!ev || !ev.id) continue;
      if (seen.has(ev.id)) continue;
      seen.add(ev.id);
      dedup.push(ev);
    }

    store.events.set(dedup);
    store.schema.set('2');
  }
 // --- Ledger central (seule porte qui modifie balances + écrit événements)
  const ledger = {
    getEvents() {
      migrateLegacyTxsToEvents();
      return store.events.getRaw().map(normalizeEvent);
    },
    addEvent(ev) {
      const list = this.getEvents();
      const normalized = normalizeEvent(ev);

      // Persist event first (audit trail), then apply state
      list.push(normalized);
      store.events.set(list);

      // Apply to balances when relevant
      this.applyToBalances(normalized);

      // Refresh side UI
      renderSide();
      return normalized;
    },
    applyToBalances(ev) {
      const kind = ev.kind;
      const amt = ev.amount === undefined ? 0 : Number(ev.amount);

      if (kind === 'LOGIN') return; // no balance change
      if (kind === 'SIGNUP') return; // no balance change

      if (kind === 'SEED') {
        // legacy seed used to set initial balance via event amount (optional)
        if (!ev.actor) return;
        this.changeBalance(ev.actor, amt);
        return;
      }

      if (kind === 'DEPOSIT' || kind === 'MONCASH') {
        this.changeBalance(ev.actor, Math.abs(amt));
        return;
      }

      if (kind === 'WITHDRAW') {
        this.changeBalance(ev.actor, -Math.abs(amt));
        return;
      }

      if (kind === 'P2P') {
        const to = ev.counterparty;
        if (!to) return;
        this.changeBalance(ev.actor, -Math.abs(amt));
        this.changeBalance(to, Math.abs(amt));
        return;
      }
    },
    changeBalance(email, delta) {
      const users = store.users.get();
      const u = users.find((x) => x.email === String(email).toLowerCase());
      if (!u) return;

      u.balance = Math.round(((u.balance || 0) + Number(delta)) * 100) / 100;
      store.users.set(users);

      // If current session matches, refresh session data
      const cu = currentUser();
      if (cu && cu.email === u.email) setCurrent(u);
    },
    getUser(email) {
      return store.users.findByEmail(email);
    },
    historyFor(email) {
      const e = String(email).toLowerCase();
      return this.getEvents().filter((ev) => ev.actor === e || ev.counterparty === e);
    }
  };

  // --- init demo data
  (function initData() {
    migrateLegacyTxsToEvents();

    if (store.users.get().length === 0) {
      const demo = { id: 1, name: 'Demo User', email: 'demo@fiaxy.test', pass: fauxHash('demo123'), balance: 25.0 };
      store.users.set([demo]);

      ledger.addEvent({
        id: uid('EV'),
        kind: 'SEED',
        actor: demo.email,
        amount: 25,
        currency: 'USD',
        ref: 'INIT',
        note: 'Compte demo créé',
        createdAt: isoNow(),
        source: 'client'
      });
    }

    renderSide();
  })();

  // --- router
  const routes = { '/': home, '/vault': vault, '/p2p': p2p, '/txs': txs, '/signup': signup, '/login': login };
  window.addEventListener('hashchange', router);

  document.querySelectorAll('[data-link]').forEach((b) =>
    b.addEventListener('click', (e) => {
      e.preventDefault();
      location.hash = b.dataset.link;
    })
  );

  $('#ctaAuth').addEventListener('click', () => {
    if (currentUser()) {
      clearCurrent();
      toast('Déconnecté');
    } else location.hash = '#/login';
  });

  // --- modal open/close
  const monModal = $('#monModal');
  function openMonModal() {
    monModal.classList.remove('modal-hidden');
    monModal.style.display = 'grid';
  }
  function closeMonModal() {
    monModal.style.display = 'none';
    monModal.classList.add('modal-hidden');
  }
  $('#closeMon').addEventListener('click', closeMonModal);
  $('#monForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
     async function simulateMoncash(to, amount, ref) {
    const dest = store.users.findByEmail(to);
    if (!dest) {
      toast('Destinataire introuvable');
      return;
    }

    const amt = Number(amount);
    const reference = ref || 'MC-' + Date.now();

    // 1) Try ONLINE first (server logs + emails)
    if (apiEnabled()) {
      try {
        await apiPost('/moncash', { to: dest.email, amount: amt, ref: reference });

        // Apply locally as authoritative “credited”
        const ev = ledger.addEvent({
          kind: 'MONCASH',
          actor: dest.email,
          amount: amt,
          currency: 'USD',
          ref: reference,
          note: 'MonCash inbound (server-notified)',
          createdAt: isoNow(),
          source: 'server'
        });

        setCurrent(store.users.findByEmail(dest.email));
        toast(`MonCash (serveur): +${format(ev.amount)}`);
        router();
        return;
      } catch (err) {
        console.warn('[moncash] server failed, fallback local:', err);
        toast('Serveur indisponible — fallback local');
        // fallback continues below
      }
    }
        fetchServerBalance(me.email).then((b) => {
  if (typeof b === 'number') {
    me.balance = b;
    store.users.upsert(me);
    setCurrent(me);
  }
});


    // 2) OFFLINE fallback (local simulation)
    const ev = ledger.addEvent({
      kind: 'MONCASH',
      actor: dest.email,
      amount: amt,
      currency: 'USD',
      ref: reference,
      note: 'MonCash simulated inbound (local)',
      createdAt: isoNow(),
      source: 'client'
    });

    setCurrent(store.users.findByEmail(dest.email));
    toast(`MonCash simulé: +${format(ev.amount)}`);
    router();
  }

  });

  // --- business actions
  function simulateMoncash(to, amount, ref) {
    const dest = store.users.findByEmail(to);
    if (!dest) {
      toast('Destinataire introuvable');
      return;
    }

    const ev = ledger.addEvent({
      kind: 'MONCASH',
      actor: dest.email,
      amount: Number(amount),
      currency: 'USD',
      ref: ref || uid('MC'),
      note: 'MonCash simulated inbound',
      createdAt: isoNow(),
      source: 'client'
    });
  // Keep current session aligned to credited account (as before)
    setCurrent(store.users.findByEmail(dest.email));
    toast(`MonCash simulé: +${format(ev.amount)}`);
    router();
  }

  // --- render functions (views)
  function router() {
    const path = location.hash.replace('#', '') || '/';
    const fn = routes[path] || notfound;
    $('#view').innerHTML = '';
    fn();
  }

  function home() {
    $('#view').innerHTML = `
      <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center">
        <div style="flex:1;min-width:260px" class="card">
          <div class="vault-hero">
            <div class="pig-icon">🐷</div>
            <div>
              <div class="kv">Ti kochon coffre</div>
              <div class="muted">Gestion simple de flux financiers - prototype</div>
              <div style="height:10px"></div>
              <div class="chip">Logo: <i class="ri-piggy-bank-line"></i> <span style="margin-left:6px">TiKochon</span></div>
            </div>
          </div>
          <div style="height:12px"></div>
          <div class="muted-xs">Fonctionnalités</div>
          <ul class="small">
            <li>Inscription / Connexion client-side</li>
            <li>Simulation MonCash (paiement entrant)</li>
            <li>Transfert P2P entre comptes</li>
            <li>Historique & profil de transaction</li>
          </ul>
        </div>

        <div style="flex:1;min-width:320px" class="card">
          <h2>Accès rapide</h2>
          <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
            <button class="btn" onclick="location.hash='#/signup'">Créer un compte</button>
            <button class="ghost" onclick="location.hash='#/login'">Se connecter</button>
            <button class="ghost" onclick="openMonModal()">Simuler MonCash</button>
          </div>
          <div style="height:10px"></div>
          <div class="muted-xs">Test rapide</div>
          <ol class="small">
            <li>Créer un compte (ou utiliser <code>demo@fiaxy.test</code>)</li>
            <li>Se connecter</li>
            <li>Déposer via MonCash simulé, puis transférer P2P</li>
            <li>Vérifier l'historique dans Profil Tx</li>
          </ol>
        </div>
      </div>
    `;
  }

  function signup() {
    $('#view').innerHTML = `
      <h2>Créer un compte</h2>
      <form id="signupForm" class="small">
        <label>Nom complet<input name="name" required></label>
        <label>Email<input name="email" required type="email"></label>
        <label>Mot de passe<input name="password" required type="password" placeholder="min 6 char"></label>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn" type="submit">S'inscrire</button>
          <button class="ghost" type="button" onclick="location.hash='#/login'">J'ai déjà un compte</button>
        </div>
      </form>
    `;

    $('#signupForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      const email = String(f.email || '').toLowerCase();
      const users = store.users.get();
      if (users.some((u) => u.email === email)) {
        toast('Email déjà utilisé');
        return;
      }

      const user = { id: Date.now(), name: f.name, email, pass: fauxHash(f.password), balance: 0 };
            store.users.upsert(user);

      ledger.addEvent({
        kind: 'SIGNUP',
        actor: user.email,
        currency: 'USD',
        ref: 'SIGNUP',
        note: 'Compte créé',
        createdAt: isoNow(),
        source: 'client'
      });

      // notify server (best effort) — does not block UX
      if (apiEnabled()) {
        apiPost('/notify/signup', { name: user.name, email: user.email })
          .then(() => console.info('[signup] notified server'))
          .catch((err) => console.warn('[signup] notify failed:', err));
      }

      setCurrent(user);
      toast('Compte créé');
      location.hash = '#/vault';

    });
  }

  function login() {
    $('#view').innerHTML = `
      <h2>Connexion</h2>
      <form id="loginForm" class="small">
        <label>Email<input name="email" required type="email"></label>
        <label>Mot de passe<input name="password" required type="password"></label>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn" type="submit">Se connecter</button>
          <button class="ghost" type="button" onclick="location.hash='#/signup'">Créer compte</button>
        </div>
      </form>
    `;

    $('#loginForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      const email = String(f.email || '').toLowerCase();
      const found = store.users.get().find((u) => u.email === email && u.pass === fauxHash(f.password));
      if (!found) {
        toast('Identifiants incorrects');
        return;
      }

      setCurrent(found);

      ledger.addEvent({
        kind: 'LOGIN',
        actor: found.email,
        currency: 'USD',
        ref: 'LOGIN-' + Date.now(),
        note: 'Connexion',
        createdAt: isoNow(),
        source: 'client'
      });

      toast('Connecté');
      location.hash = '#/vault';
    });
  }

  function vault() {
    const user = currentUser();
    if (!user) {
      $('#view').innerHTML = `
        <h2>Accès au coffre</h2>
        <p class="muted">Tu dois te connecter pour gérer ton coffre.</p>
        <div style="margin-top:8px"><button class="btn" onclick="location.hash='#/login'">Se connecter</button></div>
      `;
      return;
    }

    const me = store.users.findByEmail(user.email) || user;
    setCurrent(me);

    $('#view').innerHTML = `
      <div style="display:flex;gap:12px;flex-wrap:wrap">
        <div style="flex:1;min-width:300px">
          <div class="card">
            <div style="display:flex;gap:12px;align-items:center">
              <div class="pig-icon">🐷</div>
              <div>
                <div class="kv">Bonjour, <strong>${me.name}</strong></div>
                <div class="muted">Email: ${me.email}</div>
                <div style="height:8px"></div>
                <div class="balance">${format(me.balance)}</div>
                <div class="muted-xs">Solde disponible</div>
              </div>
            </div>
            <div style="height:12px"></div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn" id="openMonBtn">Simuler MonCash</button>
              <button class="ghost" id="depositBtn">Dépôt manuel</button>
              <button class="ghost" id="withdrawBtn">Retrait manuel</button>
              <button class="ghost" id="logoutBtn">Se déconnecter</button>
            </div>
          </div>
        </div>

        <div style="flex:1;min-width:260px">
          <div class="card">
            <h3>Journal & actions</h3>
            <div style="height:8px"></div>
            <form id="manualForm" class="small">
              <label>Type<select name="type"><option value="deposit">Dépôt</option><option value="withdraw">Retrait</option></select></label>
              <label>Montant<input name="amount" type="number" required step="0.01" min="0.01" value="5"></label>
              <div style="display:flex;gap:8px;margin-top:8px">
                <button class="btn" type="submit">Envoyer</button>
                <button type="button" class="ghost" id="clearTxs">Effacer historique (dev)</button>
              </div>
            </form>
            <div style="height:8px"></div>
            <div class="muted-xs">Dernières 6 tx</div>
            <div id="lastTxs" class="log"></div>
          </div>
        </div>
      </div>
    `;

    $('#openMonBtn').addEventListener('click', () => openMonModal());
    $('#logoutBtn').addEventListener('click', () => {
      clearCurrent();
      toast('Déconnecté');
      router();
    });

    $('#manualForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      const amt = Number(f.amount);

      const latestMe = store.users.findByEmail(me.email) || me;
      if (f.type === 'withdraw' && amt > (latestMe.balance || 0)) {
        toast('Solde insuffisant');
        return;
      }

      if (f.type === 'deposit') {
        ledger.addEvent({
          kind: 'DEPOSIT',
          actor: latestMe.email,
          amount: amt,
          currency: 'USD',
          ref: 'DEP-' + Date.now(),
          note: 'manual',
          createdAt: isoNow(),
          source: 'client'
        });
      } else {
        ledger.addEvent({
          kind: 'WITHDRAW',
          actor: latestMe.email,
          amount: amt,
          currency: 'USD',
          ref: 'WIT-' + Date.now(),
          note: 'manual',
          createdAt: isoNow(),
          source: 'client'
        });
      }

      toast('Transaction ok');
      router();
    });

    $('#clearTxs').addEventListener('click', () => {
      localStorage.removeItem(K_EVENTS);
      store.schema.set('1');
      migrateLegacyTxsToEvents();
      toast('Historique effacé');
      renderSide();
      router();
    });

    renderLastEvents(me.email);
  }

  function p2p() {
    const user = currentUser();
    if (!user) {
      $('#view').innerHTML = `<h2>Transfert P2P</h2><p class="muted">Connecte-toi pour transférer vers un autre compte.</p>`;
      return;
    }

    $('#view').innerHTML = `
      <h2>Transfert P2P</h2>
      <form id="p2pForm" class="small card">
        <label>Destinataire (email)<input name="to" required type="email" placeholder="ex: ami@ex.com"></label>
        <label>Montant (USD)<input name="amount" required type="number" step="0.01" min="0.01" value="1"></label>
        <label>Note (optionnel)<input name="note" placeholder="Pour quoi ?"></label>
        <div style="display:flex;gap:8px;margin-top:8px"><button class="btn" type="submit">Transférer</button></div>
      </form>
    `;

    $('#p2pForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));

      const me = store.users.findByEmail(currentUser().email);
      const to = store.users.findByEmail(f.to);
      if (!to) {
        toast('Destinataire non trouvé');
        return;
      }

      const amt = Number(f.amount);
      if (amt > (me?.balance || 0)) {
        toast('Solde insuffisant');
        return;
      }

      ledger.addEvent({
        kind: 'P2P',
        actor: me.email,
        counterparty: to.email,
        amount: amt,
        currency: 'USD',
        ref: 'P2P-' + Date.now(),
        note: f.note || 'p2p',
        createdAt: isoNow(),
        source: 'client'
      });

      toast('Transfert effectué');
      renderSide();
      router();
    });
  }

  function txs() {
    const user = currentUser();
    if (!user) {
      $('#view').innerHTML = `<h2>Profil transaction</h2><p class="muted">Connecte-toi pour voir ton historique.</p>`;
      return;
    }

    const list = ledger
      .historyFor(user.email)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const prettyKind = (k) => {
      const m = {
        SEED: 'seed',
        SIGNUP: 'signup',
        LOGIN: 'login',
        DEPOSIT: 'deposit',
        WITHDRAW: 'withdraw',
        P2P: 'p2p',
        MONCASH: 'moncash'
      };
      return m[k] || k;
    };

    $('#view').innerHTML = `
      <h2>Profil de transaction — ${user.name}</h2>
      <div style="height:12px"></div>
      <div class="card">
        <table>
          <thead><tr><th>Type</th><th>Montant</th><th>Contrepartie</th><th>Référence</th><th>Heure</th></tr></thead>
          <tbody>
            ${list.slice(0, 40).map((t) => `
              <tr>
                <td>${prettyKind(t.kind)}</td>
                <td>${t.amount !== undefined ? format(t.amount) : '-'}</td>
                <td>${t.counterparty ? t.counterparty : '—'}</td>
                <td>${t.ref || ''}</td>
                <td>${new Date(t.createdAt).toLocaleString()}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function notfound() {
    $('#view').innerHTML = `<h2>404</h2><p class="muted">Page introuvable</p>`;
  }

  // --- UI helpers
  function renderLastEvents(email) {
    const last = ledger
      .historyFor(email)
      .slice(-6)
      .reverse();

    const prettyKind = (k) => {
      const m = { SEED: 'SEED', SIGNUP: 'SIGNUP', LOGIN: 'LOGIN', DEPOSIT: 'DEPOSIT', WITHDRAW: 'WITHDRAW', P2P: 'P2P', MONCASH: 'MONCASH' };
      return m[k] || k;
    };

    $('#lastTxs').innerHTML =
      last.length === 0
        ? 'Aucune transaction.'
        : last
            .map(
              (t) => `
            <div style="padding:6px;border-bottom:1px dashed rgba(255,255,255,0.03)">
              <div class="small"><strong>${prettyKind(t.kind)}</strong> ${t.amount !== undefined ? format(t.amount) : ''}</div>
              <div class="muted-xs">${t.actor} ${t.counterparty ? '→ ' + t.counterparty : ''} • ${new Date(t.createdAt).toLocaleString()}</div>
            </div>`
            )
            .join('');
  }

  function renderSide() {
    const user = currentUser();
    const si = $('#sessionInfo');
    const side = $('#sideActions');
    const mini = $('#miniTx');

    if (user) {
      const fresh = store.users.findByEmail(user.email) || user;
      si.innerHTML = `
        <div><strong>${fresh.name}</strong></div>
        <div class="muted-xs">${fresh.email}</div>
        <div style="height:8px"></div>
        <div class="balance">${format(fresh.balance)}</div>
      `;

      side.innerHTML = `
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="ghost" onclick="location.hash='#/vault'">Mon coffre</button>
          <button class="ghost" onclick="location.hash='#/txs'">Profil Tx</button>
          <button class="ghost" id="sideLogout">Se déconnecter</button>
        </div>
      `;

      document.getElementById('sideLogout')?.addEventListener('click', () => {
        clearCurrent();
        toast('Déconnecté');
        router();
      });
    } else {
      si.textContent = 'Aucun utilisateur connecté.';
      side.innerHTML = `
        <div style="display:flex;gap:8px">
          <button class="btn" onclick="location.hash='#/signup'">Créer compte</button>
          <button class="ghost" onclick="location.hash='#/login'">Se connecter</button>
        </div>
      `;
    }

    const txs = ledger.getEvents().slice(-6).reverse();
    mini.innerHTML =
      txs.length === 0
        ? 'Aucune transaction.'
        : txs
            .map(
              (t) => `
            <div style="padding:6px;border-bottom:1px dashed rgba(255,255,255,0.03)">
              <div class="small"><strong>${t.kind}</strong> ${t.amount !== undefined ? format(t.amount) : ''}</div>
              <div class="muted-xs">${t.actor} ${t.counterparty ? '→ ' + t.counterparty : ''} • ${new Date(t.createdAt).toLocaleString()}</div>
            </div>`
            )
            .join('');
  }

  // --- boot
  function boot() {
    renderSide();
    router();
  }
  boot();

  // expose for console debugging (handy)
  window.openMonModal = openMonModal;
  window.simulateMoncash = simulateMoncash;
  window.ledger = ledger;
});
