/* Ti Cochon Coffre — Minimal Admin Dashboard
   Requires backend mode:
   localStorage.setItem('tk_server_url', 'http://localhost:3000')
   localStorage.setItem('tk_admin_token', 'change-me-admin-token')
*/
(function () {
  const K_ADMIN_TOKEN = 'tk_admin_token';

  function q(selector) {
    return document.querySelector(selector);
  }

  function serverUrl() {
    return localStorage.getItem('tk_server_url') || '';
  }

  function adminToken() {
    return localStorage.getItem(K_ADMIN_TOKEN) || '';
  }

  function setAdminToken(token) {
    if (token) localStorage.setItem(K_ADMIN_TOKEN, token);
  }

  function clearAdminToken() {
    localStorage.removeItem(K_ADMIN_TOKEN);
  }

  function isAdminRoute() {
    const route = window.location.hash.replace('#', '') || '/';
    return route === '/admin';
  }

  function money(value) {
    return '$' + Number(value || 0).toFixed(2);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  async function adminRequest(path) {
    if (!serverUrl()) throw new Error('Backend URL manquant');
    if (!adminToken()) throw new Error('Token admin manquant');

    const res = await fetch(serverUrl().replace(/\/$/, '') + path, {
      headers: {
        'content-type': 'application/json',
        'x-admin-token': adminToken()
      }
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);
    return data;
  }

  function renderAdminShell(message = '') {
    const view = q('#view');
    if (!view) return;

    view.classList.remove('landing-shell');
    view.innerHTML = `
      <div class="admin-shell">
        <div class="admin-header">
          <div>
            <div class="muted-xs">Dashboard Admin</div>
            <h2>Supervision Ti Cochon Coffre</h2>
            <p class="muted">Vue minimale pour utilisateurs, soldes, volume et transactions serveur.</p>
          </div>
          <div class="admin-status ${serverUrl() ? 'ok' : 'bad'}">
            ${serverUrl() ? 'Backend configuré' : 'Backend non configuré'}
          </div>
        </div>

        <div class="notice">
          Pour activer : <code>tk_server_url</code> + <code>tk_admin_token</code> dans le navigateur. Le token doit correspondre à <code>ADMIN_TOKEN</code> côté serveur.
        </div>

        <form id="adminConfigForm" class="card admin-config-card">
          <label>Backend URL
            <input name="serverUrl" placeholder="http://localhost:3000" value="${escapeHtml(serverUrl())}">
          </label>
          <label>Admin token
            <input name="adminToken" type="password" placeholder="change-me-admin-token" value="${escapeHtml(adminToken())}">
          </label>
          <div class="form-actions">
            <button class="btn" type="submit">Charger le dashboard</button>
            <button class="ghost danger-soft" type="button" id="clearAdminConfig">Effacer token</button>
          </div>
        </form>

        ${message ? `<div class="notice admin-message">${escapeHtml(message)}</div>` : ''}

        <div id="adminContent" class="admin-content"></div>
      </div>
    `;

    q('#adminConfigForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      if (f.serverUrl) localStorage.setItem('tk_server_url', String(f.serverUrl).trim());
      if (f.adminToken) setAdminToken(String(f.adminToken).trim());
      loadAdminData();
    });

    q('#clearAdminConfig')?.addEventListener('click', () => {
      clearAdminToken();
      renderAdminShell('Token admin effacé.');
    });
  }

  function renderSummary(summary) {
    return `
      <div class="admin-stats">
        <div class="stat"><strong>${summary.users}</strong><span>Utilisateurs</span></div>
        <div class="stat"><strong>${summary.activeSessions}</strong><span>Sessions actives</span></div>
        <div class="stat"><strong>${summary.transactions}</strong><span>Transactions</span></div>
        <div class="stat"><strong>${money(summary.totalBalance)}</strong><span>Solde total</span></div>
        <div class="stat"><strong>${money(summary.totalVolume)}</strong><span>Volume total</span></div>
      </div>
    `;
  }

  function renderUsers(users) {
    return `
      <div class="card table-wrap admin-section">
        <h3>Utilisateurs</h3>
        <table>
          <thead><tr><th>Nom</th><th>Email</th><th>Solde</th><th>Créé le</th></tr></thead>
          <tbody>
            ${users.length ? users.map((u) => `
              <tr>
                <td>${escapeHtml(u.name)}</td>
                <td>${escapeHtml(u.email)}</td>
                <td>${money(u.balance)}</td>
                <td>${new Date(u.createdAt).toLocaleString()}</td>
              </tr>
            `).join('') : '<tr><td colspan="4" class="muted">Aucun utilisateur.</td></tr>'}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderTransactions(events) {
    return `
      <div class="card table-wrap admin-section">
        <h3>Dernières transactions</h3>
        <table>
          <thead><tr><th>Type</th><th>Acteur</th><th>Contrepartie</th><th>Montant</th><th>Statut</th><th>Référence</th><th>Date</th></tr></thead>
          <tbody>
            ${events.length ? events.map((ev) => `
              <tr>
                <td>${escapeHtml(ev.kind)}</td>
                <td>${escapeHtml(ev.actor)}</td>
                <td>${ev.counterparty ? escapeHtml(ev.counterparty) : '—'}</td>
                <td>${ev.amount !== undefined ? money(ev.amount) : '-'}</td>
                <td>${escapeHtml(ev.status || 'confirmed')}</td>
                <td>${escapeHtml(ev.ref || '')}</td>
                <td>${new Date(ev.createdAt).toLocaleString()}</td>
              </tr>
            `).join('') : '<tr><td colspan="7" class="muted">Aucune transaction.</td></tr>'}
          </tbody>
        </table>
      </div>
    `;
  }

  async function loadAdminData() {
    renderAdminShell('Chargement du dashboard...');
    const content = q('#adminContent');

    try {
      const [summaryRes, usersRes, txRes] = await Promise.all([
        adminRequest('/admin/summary'),
        adminRequest('/admin/users?limit=100'),
        adminRequest('/admin/transactions?limit=100')
      ]);

      if (!q('#adminContent')) renderAdminShell();
      q('#adminContent').innerHTML = `
        ${renderSummary(summaryRes.summary)}
        ${renderUsers(usersRes.users || [])}
        ${renderTransactions(txRes.events || [])}
      `;
    } catch (err) {
      if (content) {
        content.innerHTML = `<div class="notice admin-error">${escapeHtml(err.message || 'Erreur admin')}</div>`;
      } else {
        renderAdminShell(err.message || 'Erreur admin');
      }
    }
  }

  function refresh() {
    if (!isAdminRoute()) return;
    setTimeout(() => {
      renderAdminShell();
      if (serverUrl() && adminToken()) loadAdminData();
    }, 0);
  }

  document.addEventListener('DOMContentLoaded', refresh);
  window.addEventListener('hashchange', refresh);

  if (document.readyState !== 'loading') refresh();
})();
