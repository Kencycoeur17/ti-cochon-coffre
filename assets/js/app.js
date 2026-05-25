// === CONFIG ===
// Offline mode is the default. To enable the SQLite backend MVP:
// localStorage.setItem('tk_server_url', 'http://localhost:3000')
// Optional legacy MonCash/API-key routes:
// localStorage.setItem('tk_server_api_key', 'change-me-long-random-dev-key')
const SERVER_URL = localStorage.getItem('tk_server_url') || '';
const SERVER_API_KEY = localStorage.getItem('tk_server_api_key') || '';

/* assets/js/app.js
   Ti Cochon Coffre — SPA logic
   - Offline localStorage demo mode
   - Optional SQLite server mode with auth + bearer token
*/
document.addEventListener('DOMContentLoaded', () => {
  const $ = (s) => document.querySelector(s);
  const toastEl = $('#toast');

  function toast(msg, ms = 2600) {
    toastEl.textContent = msg;
    toastEl.style.display = 'block';
    clearTimeout(toastEl._timer);
    toastEl._timer = setTimeout(() => (toastEl.style.display = 'none'), ms);
  }

  const K_USERS = 'tk_users_v1';
  const K_EVENTS = 'tk_txs_v1';
  const K_SESSION = 'tk_session_v1';
  const K_SCHEMA = 'tk_schema_v1';
  const K_AUTH_TOKEN = 'tk_auth_token_v1';

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

  function serverMode() {
    return Boolean(SERVER_URL);
  }

  function apiKeyMode() {
    return Boolean(SERVER_URL && SERVER_API_KEY);
  }

  function authToken() {
    return localStorage.getItem(K_AUTH_TOKEN) || '';
  }

  function setAuthToken(token) {
    if (token) localStorage.setItem(K_AUTH_TOKEN, token);
  }

  function clearAuthToken() {
    localStorage.removeItem(K_AUTH_TOKEN);
  }

  async function apiRequest(path, { method = 'GET', body, auth = false, apiKey = false, timeoutMs = 9000 } = {}) {
    if (!SERVER_URL) throw new Error('API disabled');

    const url = SERVER_URL.replace(/\/$/, '') + path;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);

    try {
      const headers = { 'content-type': 'application/json' };
      if (auth) headers.authorization = `Bearer ${authToken()}`;
      if (apiKey && SERVER_API_KEY) headers['x-api-key'] = SERVER_API_KEY;

      const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);
      return data;
    } finally {
      clearTimeout(t);
    }
  }

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
    clearAuthToken();
    renderSide();
  }

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
        status: ev.status || 'confirmed',
        createdAt: ev.createdAt,
        source: ev.source || 'client'
      };
    }

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
      status: 'confirmed',
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
      if (ev.status && ev.status !== 'confirmed') return;
      const kind = ev.kind;
      const amt = Math.abs(Number(ev.amount || 0));

      if (kind === 'LOGIN' || kind === 'SIGNUP') return;
      if (kind === 'SEED' || kind === 'DEPOSIT' || kind === 'MONCASH') return this.changeBalance(ev.actor, amt);
      if (kind === 'WITHDRAW') return this.changeBalance(ev.actor, -amt);
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
      if (cu && cu.email === u.email) sessionStorage.setItem(K_SESSION, JSON.stringify(u));
    },

    historyFor(email) {
      const e = cleanEmail(email);
      return this.getEvents().filter((ev) => ev.actor === e || ev.counterparty === e);
    }
  };

  (function initData() {
    migrateLegacyTxsToEvents();
    if (serverMode()) return;

    if (store.users.get().length === 0) {
      const demo = { id: 1, name: 'Demo User', email: 'demo@fiaxy.test', pass: fauxHash('demo123'), balance: 0 };
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

  const routes = { '/': home, '/vault': vault, '/p2p': p2p, '/txs': txs, '/signup': signup, '/login': login };
  window.addEventListener('hashchange', router);

  document.querySelectorAll('[data-link]').forEach((b) =>
    b.addEventListener('click', (e) => {
      e.preventDefault();
      location.hash = b.dataset.link;
    })
  );

  $('#ctaAuth').addEventListener('click', async () => {
    if (currentUser()) {
      if (serverMode() && authToken()) {
        apiRequest('/auth/logout', { method: 'POST', auth: true }).catch(() => null);
      }
      clearCurrent();
      toast('Déconnecté');
      router();
    } else {
      location.hash = '#/login';
    }
  });

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

  async function syncServerSession() {
    if (!serverMode() || !authToken()) return null;
    try {
      const data = await apiRequest('/auth/me', { auth: true });
      const user = { ...data.user, balance: data.balance || 0, serverMode: true };
      setCurrent(user);
      return user;
    } catch (err) {
      console.warn('[session] sync failed:', err);
      clearCurrent();
      return null;
    }
  }

  async function serverTransaction(path, payload) {
    const idempotencyKey = `web-${Date.now()}-${rnd(4)}`;
    return apiRequest(path, {
      method: 'POST',
      body: { ...payload, idempotencyKey },
      auth: true
    });
  }

  async function simulateMoncash(to, amount, ref) {
    if (!isPositiveAmount(amount)) return toast('Montant invalide');

    const reference = String(ref || '').trim() || 'MC-' + Date.now();
    const amt = money(amount);

    if (apiKeyMode()) {
      try {
        await apiRequest('/moncash', { method: 'POST', body: { to, amount: amt, ref: reference }, apiKey: true });
        toast(`MonCash serveur: +${format(amt)}`);
        await syncServerSession();
        router();
        return;
      } catch (err) {
        console.warn('[moncash] server failed, fallback local:', err);
        toast('Serveur indisponible — simulation locale');
      }
    }

    const dest = store.users.findByEmail(to);
    if (!dest) return toast('Destinataire introuvable');

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
              <p class="muted">${serverMode() ? 'Mode serveur SQLite activé : auth serveur, ledger backend et transactions protégées.' : 'Prototype local avec simulation MonCash, journal de transactions et solde client.'}</p>
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
            <div class="stat"><strong>${serverMode() ? 'SQL' : userCount}</strong><span>${serverMode() ? 'Backend' : 'Compte(s)'}</span></div>
            <div class="stat"><strong>${serverMode() ? 'AUTH' : txCount}</strong><span>${serverMode() ? 'Serveur' : 'Événement(s)'}</span></div>
            <div class="stat"><strong>${serverMode() ? 'ON' : 'OFF'}</strong><span>API backend</span></div>
          </div>
          <div class="notice">
            ${serverMode() ? 'Mode MVP serveur : les nouveaux comptes et transactions passent par SQLite.' : 'Mode prototype : données stockées localement dans ton navigateur.'}
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:14px">
        <div class="muted-xs">Test rapide</div>
        <ol class="small">
          <li>${serverMode() ? 'Crée un nouveau compte serveur avec un mot de passe de 8 caractères minimum.' : 'Utilise demo@fiaxy.test / demo123 ou crée un compte local.'}</li>
          <li>Ajoute un dépôt, puis tente un retrait.</li>
          <li>Teste un transfert P2P vers un autre compte existant.</li>
          <li>Vérifie l'historique dans Profil Tx.</li>
        </ol>
      </div>
    `;
  }

  function signup() {
    $('#view').innerHTML = `
      <h2>Créer un compte</h2>
      <p class="muted-xs">Mode actif : ${serverMode() ? 'Serveur SQLite' : 'Démo locale'}</p>
      <form id="signupForm" class="small">
        <label>Nom complet<input name="name" required minlength="2"></label>
        <label>Email<input name="email" required type="email"></label>
        <label>Mot de passe<input name="password" required type="password" minlength="${serverMode() ? 8 : 6}" placeholder="${serverMode() ? 'min 8 caractères' : 'min 6 caractères'}"></label>
        <div class="form-actions">
          <button class="btn" type="submit">S'inscrire</button>
          <button class="ghost" type="button" onclick="location.hash='#/login'">J'ai déjà un compte</button>
        </div>
      </form>
    `;

    $('#signupForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      const email = cleanEmail(f.email);

      if (serverMode()) {
        try {
          const data = await apiRequest('/auth/signup', {
            method: 'POST',
            body: { name: f.name, email, password: f.password }
          });
          setAuthToken(data.session.token);
          setCurrent({ ...data.user, balance: 0, serverMode: true });
          toast('Compte serveur créé');
          location.hash = '#/vault';
          return;
        } catch (err) {
          toast(err.message || 'Erreur inscription serveur');
          return;
        }
      }

      if (store.users.findByEmail(email)) return toast('Email déjà utilisé');
      const user = store.users.upsert({ id: Date.now(), name: String(f.name || '').trim(), email, pass: fauxHash(f.password), balance: 0 });
      ledger.addEvent({ kind: 'SIGNUP', actor: user.email, currency: 'USD', ref: 'SIGNUP', note: 'Compte créé', createdAt: isoNow(), source: 'client' });
      setCurrent(user);
      toast('Compte créé');
      location.hash = '#/vault';
    });
  }

  function login() {
    $('#view').innerHTML = `
      <h2>Connexion</h2>
      <p class="muted-xs">Mode actif : ${serverMode() ? 'Serveur SQLite' : 'Démo locale'}</p>
      <form id="loginForm" class="small">
        <label>Email<input name="email" required type="email"></label>
        <label>Mot de passe<input name="password" required type="password"></label>
        <div class="form-actions">
          <button class="btn" type="submit">Se connecter</button>
          <button class="ghost" type="button" onclick="location.hash='#/signup'">Créer compte</button>
        </div>
      </form>
    `;

    $('#loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      const email = cleanEmail(f.email);

      if (serverMode()) {
        try {
          const data = await apiRequest('/auth/login', { method: 'POST', body: { email, password: f.password } });
          setAuthToken(data.session.token);
          setCurrent({ ...data.user, balance: 0, serverMode: true });
          await syncServerSession();
          toast('Connecté au serveur');
          location.hash = '#/vault';
          return;
        } catch {
          toast('Identifiants incorrects');
          return;
        }
      }

      const found = store.users.get().find((u) => u.email === email && u.pass === fauxHash(f.password));
      if (!found) return toast('Identifiants incorrects');
      setCurrent(found);
      ledger.addEvent({ kind: 'LOGIN', actor: found.email, currency: 'USD', ref: 'LOGIN-' + Date.now(), note: 'Connexion', createdAt: isoNow(), source: 'client' });
      toast('Connecté');
      location.hash = '#/vault';
    });
  }

  async function vault() {
    let user = currentUser();
    if (serverMode() && authToken()) user = await syncServerSession();

    if (!user) {
      $('#view').innerHTML = `
        <h2>Accès au coffre</h2>
        <p class="muted">Tu dois te connecter pour gérer ton coffre.</p>
        <div style="margin-top:8px"><button class="btn" onclick="location.hash='#/login'">Se connecter</button></div>
      `;
      return;
    }

    const me = serverMode() ? user : store.users.findByEmail(user.email) || user;
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
              <div class="muted-xs">Solde disponible • ${serverMode() ? 'serveur SQLite' : 'local'}</div>
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
              ${serverMode() ? '' : '<button type="button" class="ghost danger-soft" id="clearTxs">Effacer historique (dev)</button>'}
            </div>
          </form>
          <div style="height:8px"></div>
          <div class="muted-xs">Dernières 6 tx</div>
          <div id="lastTxs" class="log"></div>
        </div>
      </div>
    `;

    $('#openMonBtn').addEventListener('click', () => openMonModal());
    $('#logoutBtn').addEventListener('click', async () => {
      if (serverMode() && authToken()) apiRequest('/auth/logout', { method: 'POST', auth: true }).catch(() => null);
      clearCurrent();
      toast('Déconnecté');
      router();
    });

    $('#manualForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      const amt = money(f.amount);
      if (!isPositiveAmount(amt)) return toast('Montant invalide');

      if (serverMode()) {
        try {
          await serverTransaction(f.type === 'deposit' ? '/transactions/deposit' : '/transactions/withdraw', { amount: amt });
          toast('Transaction serveur ok');
          await syncServerSession();
          router();
          return;
        } catch (err) {
          toast(err.message || 'Transaction refusée');
          return;
        }
      }

      const latestMe = store.users.findByEmail(me.email) || me;
      if (f.type === 'withdraw' && amt > (latestMe.balance || 0)) return toast('Solde insuffisant');
      ledger.addEvent({ kind: f.type === 'deposit' ? 'DEPOSIT' : 'WITHDRAW', actor: latestMe.email, amount: amt, currency: 'USD', ref: (f.type === 'deposit' ? 'DEP-' : 'WIT-') + Date.now(), note: 'manual', createdAt: isoNow(), source: 'client' });
      toast('Transaction ok');
      router();
    });

    $('#clearTxs')?.addEventListener('click', () => {
      if (!confirm("Effacer l'historique local de transactions ?")) return;
      localStorage.removeItem(K_EVENTS);
      store.schema.set('1');
      migrateLegacyTxsToEvents();
      toast('Historique effacé');
      renderSide();
      router();
    });

    if (serverMode()) {
      const data = await apiRequest('/me/transactions?limit=6', { auth: true }).catch(() => ({ events: [] }));
      renderEvents($('#lastTxs'), data.events || []);
    } else {
      renderLastEvents(me.email);
    }
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

    $('#p2pForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      const amt = money(f.amount);
      if (!isPositiveAmount(amt)) return toast('Montant invalide');

      if (serverMode()) {
        try {
          await serverTransaction('/transactions/p2p', { to: f.to, amount: amt, note: f.note || 'p2p' });
          toast('Transfert serveur effectué');
          await syncServerSession();
          location.hash = '#/vault';
          return;
        } catch (err) {
          toast(err.message || 'Transfert refusé');
          return;
        }
      }

      const me = store.users.findByEmail(currentUser().email);
      const to = store.users.findByEmail(f.to);
      if (!to) return toast('Destinataire non trouvé');
      if (to.email === me.email) return toast('Transfert vers soi-même impossible');
      if (amt > (me.balance || 0)) return toast('Solde insuffisant');

      ledger.addEvent({ kind: 'P2P', actor: me.email, counterparty: to.email, amount: amt, currency: 'USD', ref: 'P2P-' + Date.now(), note: String(f.note || 'p2p').trim(), createdAt: isoNow(), source: 'client' });
      toast('Transfert effectué');
      router();
    });
  }

  async function txs() {
    const user = currentUser();
    if (!user) {
      $('#view').innerHTML = `<h2>Profil transaction</h2><p class="muted">Connecte-toi pour voir ton historique.</p>`;
      return;
    }

    $('#view').innerHTML = `<h2>Profil de transaction — ${escapeHtml(user.name)}</h2><div class="card log">Chargement...</div>`;

    const list = serverMode()
      ? ((await apiRequest('/me/transactions?limit=100', { auth: true }).catch(() => ({ events: [] }))).events || [])
      : ledger.historyFor(user.email).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    $('#view').innerHTML = `
      <h2>Profil de transaction — ${escapeHtml(user.name)}</h2>
      <div style="height:12px"></div>
      <div class="card table-wrap">
        <table>
          <thead><tr><th>Type</th><th>Montant</th><th>Contrepartie</th><th>Statut</th><th>Référence</th><th>Heure</th></tr></thead>
          <tbody>
            ${list.length ? list.slice(0, 100).map((t) => `
              <tr>
                <td>${eventLabel(t.kind)}</td>
                <td>${t.amount !== undefined ? format(t.amount) : '-'}</td>
                <td>${t.counterparty ? escapeHtml(t.counterparty) : '—'}</td>
                <td>${escapeHtml(t.status || 'confirmed')}</td>
                <td>${escapeHtml(t.ref || '')}</td>
                <td>${new Date(t.createdAt).toLocaleString()}</td>
              </tr>`).join('') : '<tr><td colspan="6" class="muted">Aucune transaction.</td></tr>'}
          </tbody>
        </table>
      </div>
    `;
  }

  function notfound() {
    $('#view').innerHTML = `<h2>404</h2><p class="muted">Page introuvable</p>`;
  }

  function renderEvents(target, list) {
    if (!target) return;
    target.innerHTML =
      list.length === 0
        ? 'Aucune transaction.'
        : list.map((t) => `
          <div class="tx-item">
            <div class="small"><strong>${eventLabel(t.kind)}</strong> ${t.amount !== undefined ? format(t.amount) : ''}</div>
            <div class="muted-xs">${escapeHtml(t.actor)} ${t.counterparty ? '→ ' + escapeHtml(t.counterparty) : ''} • ${escapeHtml(t.status || 'confirmed')} • ${new Date(t.createdAt).toLocaleString()}</div>
          </div>`).join('');
  }

  function renderLastEvents(email) {
    renderEvents($('#lastTxs'), ledger.historyFor(email).slice(-6).reverse());
  }

  async function renderSide() {
    const user = currentUser();
    const si = $('#sessionInfo');
    const side = $('#sideActions');
    const mini = $('#miniTx');
    if (!si || !side || !mini) return;

    if (user) {
      si.innerHTML = `
        <div><strong>${escapeHtml(user.name)}</strong></div>
        <div class="muted-xs">${escapeHtml(user.email)}</div>
        <div style="height:8px"></div>
        <div class="balance">${format(user.balance)}</div>
        <div class="muted-xs">${serverMode() ? 'Serveur SQLite' : 'Démo locale'}</div>
      `;
      side.innerHTML = `
        <div class="side-actions">
          <button class="ghost" onclick="location.hash='#/vault'">Mon coffre</button>
          <button class="ghost" onclick="location.hash='#/txs'">Profil Tx</button>
          <button class="ghost" id="sideLogout">Se déconnecter</button>
        </div>
      `;
      document.getElementById('sideLogout')?.addEventListener('click', () => {
        if (serverMode() && authToken()) apiRequest('/auth/logout', { method: 'POST', auth: true }).catch(() => null);
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

    if (serverMode() && authToken()) {
      const data = await apiRequest('/me/transactions?limit=6', { auth: true }).catch(() => ({ events: [] }));
      renderEvents(mini, data.events || []);
    } else {
      renderEvents(mini, ledger.getEvents().slice(-6).reverse());
    }
  }

  async function boot() {
    if (serverMode() && authToken()) await syncServerSession();
    renderSide();
    router();
  }

  boot();

  window.openMonModal = openMonModal;
  window.simulateMoncash = simulateMoncash;
  window.ledger = ledger;
});
