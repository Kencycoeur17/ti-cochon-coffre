# 🐷 Ti Cochon Coffre

**Ti Cochon Coffre** est un prototype fintech local-first devenu un **MVP serveur testable** avec SQLite, authentification serveur, ledger backend, transactions protégées et simulation MonCash.

> ⚠️ **Statut actuel : MVP testable / prototype fintech.**  
> Ce projet ne doit pas être utilisé pour gérer de l'argent réel sans intégration MonCash officielle, conformité, monitoring, backups et contrôles anti-fraude renforcés.

---

## 🌐 Preview rapide

Quand GitHub Pages est activé sur le repo, le frontend statique peut être testé ici :

```txt
https://kencycoeur17.github.io/ti-cochon-coffre/
```

Pour activer GitHub Pages :

```txt
GitHub Repo → Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: main / root → Save
```

Un fichier `.nojekyll` est présent à la racine pour éviter que GitHub Pages ne filtre certains fichiers statiques.

---

## 🎯 Vision

Beaucoup de petites caisses, groupes d'épargne, familles, clubs, agents et communautés gèrent encore leurs mouvements d'argent via WhatsApp, cahiers, notes ou mémoire.

**Ti Cochon Coffre** propose une expérience simple pour :

- créer un coffre utilisateur ;
- simuler un dépôt MonCash ;
- faire un transfert interne P2P ;
- consulter l'historique transactionnel ;
- tester rapidement une logique de mini-wallet communautaire.

---

## ✅ Fonctionnalités actuelles

### Frontend

- Landing page premium orientée produit.
- Mode offline localStorage pour démo rapide.
- Mode serveur SQLite quand `tk_server_url` est configuré.
- Signup/login local ou serveur.
- Solde utilisateur.
- Dépôt manuel.
- Retrait manuel avec contrôle du solde.
- Simulation MonCash entrante.
- Transfert P2P entre comptes.
- Journal de transactions.
- Profil transactionnel.

### Serveur SQLite MVP

- API Express.
- SQLite avec tables `users`, `sessions`, `ledger_events`.
- Authentification serveur avec PBKDF2.
- Sessions bearer token.
- `POST /auth/signup`.
- `POST /auth/login`.
- `GET /auth/me`.
- `POST /auth/logout`.
- `POST /transactions/deposit`.
- `POST /transactions/withdraw`.
- `POST /transactions/p2p`.
- `GET /me/balance`.
- `GET /me/transactions`.
- Route legacy `POST /moncash` protégée par `x-api-key` pour simulation.
- Idempotency key sur transactions.
- Notifications email optionnelles.

---

## 🧪 Compte demo

En mode offline :

```txt
Email: demo@fiaxy.test
Mot de passe: demo123
```

En mode serveur SQLite, crée un nouveau compte depuis l'interface ou via l'API. Le mot de passe doit contenir au moins 8 caractères.

---

## 🧱 Structure actuelle

```txt
ti-cochon-coffre/
├─ index.html
├─ .nojekyll
├─ assets/
│  ├─ css/
│  │  ├─ style.css
│  │  └─ landing.css
│  └─ js/
│     ├─ app.js
│     └─ landing.js
├─ server/
│  ├─ server.js
│  ├─ auth.js
│  ├─ db.js
│  ├─ sqlite-ledger.js
│  ├─ events.js
│  ├─ guards.js
│  ├─ ledger.js
│  ├─ mailer.js
│  ├─ store.js
│  ├─ package.json
│  └─ .env.example
└─ docs/
   ├─ API.md
   ├─ PRODUCT.md
   ├─ ROADMAP.md
   └─ SECURITY.md
```

---

## 🚀 Lancer le frontend

Comme le frontend est statique, tu peux l'ouvrir directement ou le servir avec un petit serveur local :

```bash
python -m http.server 8080
```

Puis ouvrir :

```txt
http://localhost:8080
```

---

## ⚙️ Lancer le serveur SQLite MVP

```bash
cd server
cp .env.example .env
npm install
npm start
```

Tester :

```bash
curl http://localhost:3000/health
```

---

## 🔗 Connecter le frontend au serveur SQLite

Dans la console du navigateur :

```js
localStorage.setItem('tk_server_url', 'http://localhost:3000')
localStorage.setItem('tk_server_api_key', 'change-me-long-random-dev-key')
```

Puis recharger la page.

Pour revenir au mode offline :

```js
localStorage.removeItem('tk_server_url')
localStorage.removeItem('tk_server_api_key')
localStorage.removeItem('tk_auth_token_v1')
```

---

## 📘 Documentation API

Voir [`docs/API.md`](docs/API.md) pour les commandes `curl` de test : signup, login, dépôt, retrait, P2P, solde, historique et MonCash simulé.

---

## 🚫 Limites actuelles

Cette version est plus testable, mais reste un MVP :

- SQLite local sans stratégie de backup automatisée ;
- pas encore de dashboard admin ;
- pas encore d'intégration MonCash officielle ;
- pas encore de rôles utilisateurs ;
- pas encore d'export CSV/PDF ;
- pas encore de monitoring production.

---

## 🛡️ Avant production

Voir [`docs/SECURITY.md`](docs/SECURITY.md), mais les priorités sont :

1. PostgreSQL managé ou SQLite avec stratégie de backup claire.
2. Intégration MonCash officielle.
3. Webhooks signés.
4. Rôles admin/agent/utilisateur.
5. Dashboard admin.
6. Logs anti-fraude.
7. Export CSV/PDF.
8. Monitoring et alertes.

---

## 🧠 Powered by

Projet conçu et amélioré par **Braintechken Solutions** pour explorer les usages fintech communautaires adaptés au marché haïtien et aux petites communautés digitales.