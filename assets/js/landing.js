/* Ti Cochon Coffre — landing page enhancer
   This layer upgrades only the home route (#/) without touching the core wallet logic.
*/
(function () {
  const originalHash = window.location.hash;

  function q(selector) {
    return document.querySelector(selector);
  }

  function getUsers() {
    try {
      return JSON.parse(localStorage.getItem('tk_users_v1') || '[]');
    } catch {
      return [];
    }
  }

  function getEvents() {
    try {
      return JSON.parse(localStorage.getItem('tk_txs_v1') || '[]');
    } catch {
      return [];
    }
  }

  function money(value) {
    return '$' + Number(value || 0).toFixed(2);
  }

  function apiEnabled() {
    return Boolean(localStorage.getItem('tk_server_url') && localStorage.getItem('tk_server_api_key'));
  }

  function isHomeRoute() {
    const route = window.location.hash.replace('#', '') || '/';
    return route === '/';
  }

  function openModalSafely() {
    if (typeof window.openMonModal === 'function') {
      window.openMonModal();
    }
  }

  function renderLanding() {
    if (!isHomeRoute()) return;

    const view = q('#view');
    if (!view) return;

    const users = getUsers();
    const events = getEvents();
    const totalBalance = users.reduce((sum, user) => sum + Number(user.balance || 0), 0);

    view.classList.add('landing-shell');
    view.innerHTML = `
      <section class="landing">
        <div class="landing-hero">
          <div class="hero-copy">
            <div class="eyebrow"><i class="ri-shield-check-line"></i> Prototype fintech local-first</div>
            <h2>Le petit coffre digital qui transforme l’épargne en réflexe simple.</h2>
            <p class="hero-subtitle">
              Ti Cochon Coffre simule un mini-wallet clair : dépôts MonCash, retraits, transfert P2P,
              historique transactionnel et solde disponible. Parfait pour valider un MVP d’épargne,
              de tontine, de coffre client ou de micro-finance communautaire.
            </p>

            <div class="hero-actions">
              <button class="btn btn-lg" data-landing-link="#/signup">Créer un coffre</button>
              <button class="ghost btn-lg" data-landing-link="#/login">Tester le compte demo</button>
              <button class="ghost btn-lg" id="landingMoncash">Simuler MonCash</button>
            </div>

            <div class="trust-row">
              <span><i class="ri-checkbox-circle-line"></i> Sans backend obligatoire</span>
              <span><i class="ri-exchange-dollar-line"></i> Flux P2P simulé</span>
              <span><i class="ri-file-list-3-line"></i> Journal transactionnel</span>
            </div>
          </div>

          <div class="phone-mockup" aria-label="Aperçu du coffre digital">
            <div class="mockup-top">
              <span>Ti Cochon</span>
              <strong>🐷</strong>
            </div>
            <div class="mockup-balance">
              <span>Solde total simulé</span>
              <strong>${money(totalBalance || 25)}</strong>
            </div>
            <div class="mockup-card success">
              <i class="ri-arrow-down-circle-line"></i>
              <div>
                <span>MonCash entrant</span>
                <strong>+ $10.00</strong>
              </div>
            </div>
            <div class="mockup-card">
              <i class="ri-send-plane-line"></i>
              <div>
                <span>Transfert P2P</span>
                <strong>Client → Famille</strong>
              </div>
            </div>
            <div class="mockup-grid">
              <div><strong>${users.length}</strong><span>Comptes</span></div>
              <div><strong>${events.length}</strong><span>Tx logs</span></div>
            </div>
          </div>
        </div>

        <div class="landing-strip">
          <div>
            <strong>Objectif MVP</strong>
            <span>Valider rapidement un service de coffre digital avant backend réel.</span>
          </div>
          <div>
            <strong>Marché naturel</strong>
            <span>Épargne mobile, clubs, agents, familles, petites communautés.</span>
          </div>
          <div>
            <strong>Statut</strong>
            <span>${apiEnabled() ? 'Backend connecté' : 'Prototype offline sécurisé pour test'}</span>
          </div>
        </div>

        <div class="section-head">
          <span class="eyebrow">Fonctionnalités clés</span>
          <h3>Un parcours simple, compréhensible et prêt pour une future vraie API.</h3>
        </div>

        <div class="feature-grid">
          <article class="feature-card">
            <i class="ri-wallet-3-line"></i>
            <h4>Coffre client</h4>
            <p>Chaque utilisateur dispose d’un solde, d’une session et d’un historique consultable.</p>
          </article>
          <article class="feature-card">
            <i class="ri-smartphone-line"></i>
            <h4>MonCash simulé</h4>
            <p>Crédite un compte comme si une notification MonCash entrante avait été reçue.</p>
          </article>
          <article class="feature-card">
            <i class="ri-arrow-left-right-line"></i>
            <h4>P2P entre comptes</h4>
            <p>Transfert immédiat entre utilisateurs existants, avec contrôle du solde disponible.</p>
          </article>
          <article class="feature-card">
            <i class="ri-file-shield-2-line"></i>
            <h4>Ledger local</h4>
            <p>Chaque action génère un événement : dépôt, retrait, login, P2P ou MonCash.</p>
          </article>
        </div>

        <div class="how-card">
          <div class="section-head compact">
            <span class="eyebrow">Comment ça marche</span>
            <h3>De l’idée au test utilisateur en 4 étapes.</h3>
          </div>
          <div class="steps">
            <div class="step"><span>01</span><strong>Créer un coffre</strong><p>Inscription simple avec email et mot de passe local.</p></div>
            <div class="step"><span>02</span><strong>Simuler un dépôt</strong><p>Crédit via modal MonCash ou dépôt manuel.</p></div>
            <div class="step"><span>03</span><strong>Transférer</strong><p>Envoyer un montant vers un autre compte existant.</p></div>
            <div class="step"><span>04</span><strong>Analyser</strong><p>Consulter le profil transactionnel et les derniers événements.</p></div>
          </div>
        </div>

        <div class="demo-banner">
          <div>
            <span class="eyebrow">Compte demo</span>
            <h3>Tester sans configuration</h3>
            <p>Utilise <code>demo@fiaxy.test</code> avec le mot de passe <code>demo123</code>.</p>
          </div>
          <button class="btn" data-landing-link="#/login">Lancer le test</button>
        </div>

        <div class="notice landing-notice">
          <strong>Note importante :</strong> cette landing présente un prototype. Pour production réelle, il faudra un backend sécurisé,
          une vraie authentification, un ledger serveur, des webhooks MonCash signés et des contrôles anti-fraude.
        </div>
      </section>
    `;

    view.querySelectorAll('[data-landing-link]').forEach((button) => {
      button.addEventListener('click', () => {
        window.location.hash = button.getAttribute('data-landing-link');
      });
    });

    q('#landingMoncash')?.addEventListener('click', openModalSafely);
  }

  function clearLandingClass() {
    if (!isHomeRoute()) {
      q('#view')?.classList.remove('landing-shell');
    }
  }

  function refresh() {
    setTimeout(() => {
      clearLandingClass();
      renderLanding();
    }, 0);
  }

  document.addEventListener('DOMContentLoaded', refresh);
  window.addEventListener('hashchange', refresh);

  if (document.readyState !== 'loading') {
    refresh();
  }

  if (!originalHash) {
    window.location.hash = '#/';
  }
})();
