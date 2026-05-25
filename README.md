# 🐷 Ti Cochon Coffre

**Ti Cochon Coffre** est un prototype fintech local-first pour simuler un coffre digital simple : dépôts, retraits, transferts P2P, historique transactionnel et simulation MonCash.

> ⚠️ **Statut actuel : prototype MVP / démo.**  
> Ce projet ne doit pas être utilisé pour gérer de l'argent réel sans backend sécurisé, authentification serveur, ledger centralisé et intégration MonCash officielle.

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
- Création de compte locale.
- Connexion locale.
- Solde utilisateur simulé.
- Dépôt manuel.
- Retrait manuel avec contrôle du solde.
- Simulation MonCash entrante.
- Transfert P2P entre comptes existants.
- Journal de transactions local.
- Profil transactionnel.
- Mode demo offline via `localStorage`.

### Serveur prototype

- API Express minimale.
- `POST /moncash` pour simuler une réception MonCash côté serveur.
- `POST /notify/signup` pour journaliser une inscription.
- `GET /ledger/:email` pour calculer un solde serveur à partir des événements.
- `GET /health` pour vérifier le serveur.
- Protection simple par `x-api-key`.
- Rate limit léger en mémoire.
- Notifications email optionnelles.

---

## 🧪 Compte demo

```txt
Email: demo@fiaxy.test
Mot de passe: demo123
```

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
│  ├─ events.js
│  ├─ guards.js
│  ├─ ledger.js
│  ├─ mailer.js
│  ├─ store.js
│  ├─ package.json
│  └─ .env.example
└─ docs/
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

## ⚙️ Lancer le serveur prototype

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

## 🔗 Connecter le frontend au serveur prototype

Dans la console du navigateur :

```js
localStorage.setItem('tk_server_url', 'http://localhost:3000')
localStorage.setItem('tk_server_api_key', 'change-me-long-random-dev-key')
```

Puis recharger la page.

---

## 🚫 Limites actuelles

Cette version utilise encore `localStorage` et `sessionStorage` côté frontend. Cela signifie que :

- les soldes locaux peuvent être modifiés depuis le navigateur ;
- les mots de passe frontend ne sont pas sécurisés pour une vraie production ;
- le ledger serveur est un fichier JSON prototype ;
- MonCash est simulé uniquement ;
- aucune donnée ne doit être considérée comme fiable pour de vrais fonds.

---

## 🛡️ Avant production

Voir [`docs/SECURITY.md`](docs/SECURITY.md), mais les priorités sont :

1. Authentification serveur.
2. Base de données réelle.
3. Ledger serveur immuable.
4. Webhooks MonCash signés.
5. Idempotency keys.
6. Dashboard admin.
7. Logs anti-fraude.
8. Export CSV/PDF.

---

## 🧠 Powered by

Projet conçu et amélioré par **Braintechken Solutions** pour explorer les usages fintech communautaires adaptés au marché haïtien et aux petites communautés digitales.