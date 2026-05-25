// === CONFIG ===
// Frontend demo mode is OFFLINE by default.
// To connect a backend, set these values temporarily in the browser console:
// localStorage.setItem('tk_server_url', 'http://localhost:3000')
// localStorage.setItem('tk_server_api_key', 'your-dev-api-key')
const SERVER_URL = localStorage.getItem('tk_server_url') || '';
const SERVER_API_KEY = localStorage.getItem('tk_server_api_key') || '';

// === END CONFIG ===

/* assets/js/app.js
   Ti kochon coffre — client SPA logic
   Data: localStorage (users, events). Session: sessionStorage.

   ✅ Braintechken PRO patch:
   - Fixed duplicate const declarations that broke the app at parse time
   - Fixed MonCash form submit flow
   - Removed undefined `me` reference
   - Added validation, safe rendering helpers and cleaner offline/online fallback
   - Kept the prototype localStorage model for quick testing
*/
document.addEventListener('DOMContentLoaded', () => {
  // --- short selectors
  const $ = (s) => document.querySelector(s);
  const toastEl = $('#toast');

  function toast(msg, ms = 2400) {
    toastEl.textContent = msg;
    toastEl.style.display = 'block';
    clearTimeout(toastEl._timer);
    toastEl._timer = setTimeout(() => (toastEl.style.display = 'none'), ms);
  }

  // --- storage keys
  const K_USERS = 'tk_users_v1';
  const K_EVENTS = 'tk_txs_v1'; // compat rétro
  const K_SESSION = 'tk_session_v1';
  const K_SCHEMA = 'tk_schema_v1';

  // --- utils
  const fauxHash = (p) => btoa(String(p || '').split('').reverse().join(''));
  const isoNow = () => new Date().toISOString();
  const money = (value) => Math.round(Number(value || 0) * 100) / 100;
  const isPositiveAmount = (value) => Number.isFinite(Number(value)) && Number(value) > 0;
  const cleanEmail = (email) => String(email || '').trim().toLowerCase();

  const rnd = (n = 12) => {
    const fallback = Array.from({ length: n }, () => Math.floor(Math.random() * 256));
    const bytes = window.crypto?.getRandomValues ? crypto.getRandomValues(new Uint8Array(n)) : fallback;
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  };

  const uid = (prefix = 'EV') => `${prefix}-${Date.now()}-${rnd(6)}`;

  function format(n) {
    return '$' + Number(n || 0).toFixed(2);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function eventLabel(kind) {
    const labels = {
      SEED: 'Initialisation',
      SIGNUP: 'Inscription',
      LOGIN: 'Connexion',
      DEPOSIT: 'Dépôt',
      WITHDRAW: 'Retrait',
      P2P: 'P2P',
      MONCASH: 'MonCash'
    };
    return labels[kind] || kind || '—';
  }

  // --- API client (optional)
  function apiEnabled() {
    return Boolean(SERVER_URL && SERVER_API_KEY);
  }

  async function apiPost(path, body, { timeoutMs = 7000 } = {}) {
    if (!apiEnabled()) throw new Error('API disabled');

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
        throw new Error(data?.message || `HTTP ${res.status}`);
      }

      return data;
    } finally {
      clearTimeout(t);
    }
  }

  // --- store
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
        localStorage.setItem(K_USERS, JSON.stringify(Array.isArray(list) ? list : []));
      },
      findByEmail(email) {
        const e = cleanEmail(email);
        return this.get().find((u) => u.email === e) || null;
      },
      upsert(user) {
        const list = this.get();
        const safeUser = {
          ...user,
          email: cleanEmail(user.email),
          balance: money(user.balance)
        };
        const idx = list.findIndex((u) => u.email === safeUser.email);
        if (idx >= 0) list[idx] = safeUser;
        else list.push(safeUser);
        this.set(list);
        return safeUser;
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
        localStorage.setItem(K_EVENTS, JSON.stringify(Array.isArray(list) ? list : []));
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
    if (!u) return;
    sessionStorage.setItem(K_SESSION, JSON.stringify(u));
    renderSide();
  }

  function clearCurrent() {
    sessionStorage.removeItem(K_SESSION);
    renderSide();
  }

  // --- Event model
  function normalizeEvent(ev) {
    if (ev && ev.kind && ev.actor && ev.createdAt) {
      return {
        id: ev.id || uid('EV'),
        kind: String(ev.kind).toUpperCase(),
        actor: cleanEmail(ev.actor),
        counterparty: ev.counterparty ? cleanEmail(ev.counterparty) : undefined,
        amount: ev.amount === undefined ? undefined : money(ev.amount),
        currency: ev.currency || 'USD',
        ref: ev.ref || uid('REF'),
        note: ev.note || '',
        createdAt: ev.createdAt,
        source: ev.source || 'client'
      };
    }

    // legacy tx v1
    const t = ev || {};
    const mapKind = {
      seed: 'SEED',
      signup: 'SIGNUP',
      login: 'LOGIN',
      deposit: 'DEPOSIT',
      withdraw: 'WITHDRAW',
      p2p: 'P2P',
      moncash: 'MONCASH'
    };

    return {
      id: String(t.id || uid('EV')),
      kind: mapKind[String(t.type || '').toLowerCase()] || 'DEPOSIT',
      actor: cleanEmail(t.email),
      counterparty: t.to ? cleanEmail(t.to) : undefined,
      amount: t.amount === undefined ? undefined : money(t.amount),
      currency: 'USD',
      ref: String(t.ref || uid('REF')),
      note: String(t.note || ''),
      createdAt: t.ts || isoNow(),
      source: 'client'
    };
  }

  function migrateLegacyTxsToEvents() {
    const raw = store.events.getRaw();

    if (!Array.isArray(raw)) {
      store.events.set([]);
      store.schema.set('2');
      return;
    }

    const seen = new Set();
    const migrated = raw.map(normalizeEvent).filter((ev) => {
      if (!ev?.id || seen.has(ev.id)) return false;
      seen.add(ev.id);
      return true;
    });

    store.events.set(migrated);
    store.schema.set('2');
  }

  // --- Ledger central
  const ledger = {
    getEvents() {
      migrateLegacyTxsToEvents();
      return store.events.getRaw().map(normalizeEvent);
    },

    addEvent(ev) {
      const normalized = normalizeEvent(ev);
      const list = this.getEvents();

      list.push(normalized);
      store.events.set(list);
      this.applyToBalances(normalized);
      renderSide();

      return normalized;
    },

    applyToBalances(ev) {
      const kind = ev.kind;
      const amt = Math.abs(Number(ev.amount || 0));

      if (kind === 'LOGIN' || kind === 'SIGNUP') return;

      if (kind === 'SEED' || kind === 'DEPOSIT' || kind === 'MONCASH') {
        this.changeBalance(ev.actor, amt);
        return;
      }

      if (kind === 'WITHDRAW') {
        this.changeBalance(ev.actor, -amt);
        return;
      }

      if (kind === 'P2P' && ev.counterparty) {
        this.changeBalance(ev.actor, -amt);
        this.changeBalance(ev.counterparty, amt);
      }
    },

    changeBalance(email, delta) {
      const users = store.users.get();
      const u = users.find((x) => x.email === cleanEmail(email));
      if (!u) return;

      u.balance = money((u.balance || 0) + Number(delta || 0));
      store.users.set(users);

      const cu = currentUser();
      if (cu && cu.email === u.email) {
        sessionStorage.setItem(K_SESSION, JSON.stringify(u));
      }
    },

    historyFor(email) {
      const e = cleanEmail(email);
      return this.getEvents().filter((ev) => ev.actor === e || ev.counterparty === e);
    }
  };

  // --- init demo data
  (function initData() {
    migrateLegacyTxsToEvents();

    if (store.users.get().length === 0) {
      const demo = {
        id: 1,
        name: 'Demo User',
        email: 'demo@fiaxy.test',
        pass: fauxHash('demo123'),
        balance: 0
      };

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
  })();

  // --- router
  const routes = {
    '/': home,
    '/vault': vault,
    '/p2p': p2p,
    '/txs': txs,
    '/signup': signup,
    '/login': login
  };

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
      router();
    } else {
      location.hash = '#/login';
    }
  });

  // --- modal open/close
  const monModal = $('#monModal');

  function openMonModal() {
    monModal.classList.remove('modal-hidden');
    monModal.setAttribute('aria-hidden', 'false');
  }

  function closeMonModal() {
    monModal.classList.add('modal-hidden');
    monModal.setAttribute('aria-hidden', 'true');
  }

  $('#closeMon').addEventListener('click', closeMonModal);
  monModal.addEventListener('click', (e) => {
    if (e.target === monModal) closeMonModal();
  });

  $('#monForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    await simulateMoncash(f.to, f.amount, f.ref);
    closeMonModal();
    e.target.reset();
  });

  // --- business actions
  async function simulateMoncash(to, amount, ref) {
    const dest = store.users.findByEmail(to);
    if (!dest) {
      toast('Destinataire introuvable');
      return;
    }

    if (!isPositiveAmount(amount)) {
      toast('Montant invalide');
      return;
    }

    const amt = money(amount);
    const reference = String(ref || '').trim() || 'MC-' + Date.now();

    if (apiEnabled()) {
      try {
        await apiPost('/moncash', { to: dest.email, amount: amt, ref: reference });

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
        toast(`MonCash serveur: +${format(ev.amount)}`);
        router();
        return;
      } catch (err) {
        console.warn('[moncash] server failed, fallback local:', err);
        toast('Serveur indisponible — simulation locale');
      }
    }

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

  // --- render functions
  function router() {
    const path = location.hash.replace('#', '') || '/';
    const fn = routes[path] || notfound;
    $('#view').innerHTML = '';
    fn();
  }

  function home() {
    const userCount = store.users.get().length;
    const txCount = ledger.getEvents().length;

    $('#view').innerHTML = `
      <div class="hero-grid">
        <div class="card hero-card">
          <div class="vault-hero">
            <div class="pig-icon">🐷</div>
            <div>
              <div class="kv">Ti kochon coffre</div>
              <h2>Coffre digital simple pour gérer dépôts, retraits et P2P.</h2>
              <p class="muted">Prototype local avec simulation MonCash, journal de transactions et solde client.</p>
              <div class="hero-actions">
                <button class="btn" onclick="location.hash='#/signup'">Créer un compte</button>
                <button class="ghost" onclick="location.hash='#/login'">Se connecter</button>
                <button class="ghost" onclick="openMonModal()">Simuler MonCash</button>
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <h2>Vue rapide</h2>
          <div class="stats">
            <div class="stat"><strong>${userCount}</strong><span>Compte(s)</span></div>
            <div class="stat"><strong>${txCount}</strong><span>Événement(s)</span></div>
            <div class="stat"><strong>${apiEnabled() ? 'ON' : 'OFF'}</strong><span>API backend</span></div>
          </div>
          <div class="notice">
            Mode prototype : données stockées localement dans ton navigateur. Ne pas utiliser comme système financier réel sans backend sécurisé.
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:14px">
        <div class="muted-xs">Test rapide</div>
        <ol class="small">
          <li>Utilise <code>demo@fiaxy.test</code> / <code>demo123</code> ou crée un compte.</li>
          <li>Simule un dépôt MonCash entrant.</li>
          <li>Transfère vers un autre compte existant.</li>
          <li>Vérifie l'historique dans Profil Tx.</li>
        </ol>
      </div>
    `;
  }

  function signup() {
    $('#view').innerHTML = `
      <h2>Créer un compte</h2>
      <form id="signupForm" class="small">
        <label>Nom complet<input name="name" required minlength="2"></label>
        <label>Email<input name="email" required type="email"></label>
        <label>Mot de passe<input name="password" required type="password" minlength="6" placeholder="min 6 caractères"></label>
        <div class="form-actions">
          <button class="btn" type="submit">S'inscrire</button>
          <button class="ghost" type="button" onclick="location.hash='#/login'">J'ai déjà un compte</button>
        </div>
      </form>
    `;

    $('#signupForm').addEventListener('submit', (e) => {
      e.preventDefault();

      const f = Object.fromEntries(new FormData(e.target));
      const email = cleanEmail(f.email);

      if (store.users.findByEmail(email)) {
        toast('Email déjà utilisé');
        return;
      }

      const user = store.users.upsert({
        id: Date.now(),
        name: String(f.name || '').trim(),
        email,
        pass: fauxHash(f.password),
        balance: 0
      });

      ledger.addEvent({
        kind: 'SIGNUP',
        actor: user.email,
        currency: 'USD',
        ref: 'SIGNUP',
        note: 'Compte créé',
        createdAt: isoNow(),
        source: 'client'
      });

      if (apiEnabled()) {
        apiPost('/notify/signup', { name: user.name, email: user.email }).catch((err) =>
          console.warn('[signup] notify failed:', err)
        );
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
        <div class="form-actions">
          <button class="btn" type="submit">Se connecter</button>
          <button class="ghost" type="button" onclick="location.hash='#/signup'">Créer compte</button>
        </div>
      </form>
    `;

    $('#loginForm').addEventListener('submit', (e) => {
      e.preventDefault();

      const f = Object.fromEntries(new FormData(e.target));
      const email = cleanEmail(f.email);
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
    sessionStorage.setItem(K_SESSION, JSON.stringify(me));

    $('#view').innerHTML = `
      <div class="vault-layout">
        <div class="card">
          <div class="vault-hero">
            <div class="pig-icon">🐷</div>
            <div>
              <div class="kv">Bonjour, <strong>${escapeHtml(me.name)}</strong></div>
              <div class="muted">Email: ${escapeHtml(me.email)}</div>
              <div style="height:8px"></div>
              <div class="balance">${format(me.balance)}</div>
              <div class="muted-xs">Solde disponible</div>
            </div>
          </div>
          <div class="hero-actions">
            <button class="btn" id="openMonBtn">Simuler MonCash</button>
            <button class="ghost" id="logoutBtn">Se déconnecter</button>
          </div>
        </div>

        <div class="card">
          <h3>Journal & actions</h3>
          <form id="manualForm" class="small">
            <label>Type
              <select name="type">
                <option value="deposit">Dépôt</option>
                <option value="withdraw">Retrait</option>
              </select>
            </label>
            <label>Montant<input name="amount" type="number" required step="0.01" min="0.01" value="5"></label>
            <div class="form-actions">
              <button class="btn" type="submit">Envoyer</button>
              <button type="button" class="ghost danger-soft" id="clearTxs">Effacer historique (dev)</button>
            </div>
          </form>
          <div style="height:8px"></div>
          <div class="muted-xs">Dernières 6 tx</div>
          <div id="lastTxs" class="log"></div>
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
      const amt = money(f.amount);
      const latestMe = store.users.findByEmail(me.email) || me;

      if (!isPositiveAmount(amt)) {
        toast('Montant invalide');
        return;
      }

      if (f.type === 'withdraw' && amt > (latestMe.balance || 0)) {
        toast('Solde insuffisant');
        return;
      }

      ledger.addEvent({
        kind: f.type === 'deposit' ? 'DEPOSIT' : 'WITHDRAW',
        actor: latestMe.email,
        amount: amt,
        currency: 'USD',
        ref: (f.type === 'deposit' ? 'DEP-' : 'WIT-') + Date.now(),
        note: 'manual',
        createdAt: isoNow(),
        source: 'client'
      });

      toast('Transaction ok');
      router();
    });

    $('#clearTxs').addEventListener('click', () => {
      if (!confirm("Effacer l'historique local de transactions ?")) return;
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
        <label>Note (optionnel)<input name="note" maxlength="80" placeholder="Pour quoi ?"></label>
        <div class="form-actions"><button class="btn" type="submit">Transférer</button></div>
      </form>
    `;

    $('#p2pForm').addEventListener('submit', (e) => {
      e.preventDefault();

      const f = Object.fromEntries(new FormData(e.target));
      const me = store.users.findByEmail(currentUser().email);
      const to = store.users.findByEmail(f.to);
      const amt = money(f.amount);

      if (!me) {
        toast('Session invalide');
        clearCurrent();
        router();
        return;
      }

      if (!to) {
        toast('Destinataire non trouvé');
        return;
      }

      if (to.email === me.email) {
        toast('Transfert vers soi-même impossible');
        return;
      }

      if (!isPositiveAmount(amt)) {
        toast('Montant invalide');
        return;
      }

      if (amt > (me.balance || 0)) {
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
        note: String(f.note || 'p2p').trim(),
        createdAt: isoNow(),
        source: 'client'
      });

      toast('Transfert effectué');
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

    $('#view').innerHTML = `
      <h2>Profil de transaction — ${escapeHtml(user.name)}</h2>
      <div style="height:12px"></div>
      <div class="card table-wrap">
        <table>
          <thead>
            <tr><th>Type</th><th>Montant</th><th>Contrepartie</th><th>Référence</th><th>Heure</th></tr>
          </thead>
          <tbody>
            ${
              list.length
                ? list
                    .slice(0, 40)
                    .map(
                      (t) => `
                        <tr>
                          <td>${eventLabel(t.kind)}</td>
                          <td>${t.amount !== undefined ? format(t.amount) : '-'}</td>
                          <td>${t.counterparty ? escapeHtml(t.counterparty) : '—'}</td>
                          <td>${escapeHtml(t.ref || '')}</td>
                          <td>${new Date(t.createdAt).toLocaleString()}</td>
                        </tr>`
                    )
                    .join('')
                : '<tr><td colspan="5" class="muted">Aucune transaction.</td></tr>'
            }
          </tbody>
        </table>
      </div>
    `;
  }

  function notfound() {
    $('#view').innerHTML = `<h2>404</h2><p class="muted">Page introuvable</p>`;
  }

  // --- UI helpers
  function renderEvents(target, list) {
    target.innerHTML =
      list.length === 0
        ? 'Aucune transaction.'
        : list
            .map(
              (t) => `
              <div class="tx-item">
                <div class="small"><strong>${eventLabel(t.kind)}</strong> ${t.amount !== undefined ? format(t.amount) : ''}</div>
                <div class="muted-xs">${escapeHtml(t.actor)} ${t.counterparty ? '→ ' + escapeHtml(t.counterparty) : ''} • ${new Date(t.createdAt).toLocaleString()}</div>
              </div>`
            )
            .join('');
  }

  function renderLastEvents(email) {
    const target = $('#lastTxs');
    if (!target) return;

    const last = ledger.historyFor(email).slice(-6).reverse();
    renderEvents(target, last);
  }

  function renderSide() {
    const user = currentUser();
    const si = $('#sessionInfo');
    const side = $('#sideActions');
    const mini = $('#miniTx');

    if (!si || !side || !mini) return;

    if (user) {
      const fresh = store.users.findByEmail(user.email) || user;

      si.innerHTML = `
        <div><strong>${escapeHtml(fresh.name)}</strong></div>
        <div class="muted-xs">${escapeHtml(fresh.email)}</div>
        <div style="height:8px"></div>
        <div class="balance">${format(fresh.balance)}</div>
      `;

      side.innerHTML = `
        <div class="side-actions">
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
        <div class="side-actions">
          <button class="btn" onclick="location.hash='#/signup'">Créer compte</button>
          <button class="ghost" onclick="location.hash='#/login'">Se connecter</button>
        </div>
      `;
    }

    const txs = ledger.getEvents().slice(-6).reverse();
    renderEvents(mini, txs);
  }

  // --- boot
  function boot() {
    renderSide();
    router();
  }

  boot();

  // expose for inline buttons + console debugging
  window.openMonModal = openMonModal;
  window.simulateMoncash = simulateMoncash;
  window.ledger = ledger;
});
