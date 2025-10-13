# Ti kochon coffre — Prototype (TiKochon Vault)

**Ti kochon coffre** is a lightweight demo of a client-side vault/prototype:
- Signup / Login (client-side, for testing)
- Dashboard (coffre)
- Simulated MonCash inbound payments (modal)
- P2P transfers between users
- Transaction profile / history

> ⚠️ This is a prototype for testing and demos **only**. Do **not** use for real money or production.

## Structure

### Notifications e-mail (signup & MonCash)

Le serveur propose deux endpoints protégés par `x-api-key` :

- `POST /notify/signup` — body: `{ name, email }` — notifie l'admin et envoie un e-mail de bienvenue.
- `POST /moncash` — body: `{ to, amount, ref }` — enregistre l'événement et envoie un e-mail d'alerte à l'admin (et tentative d'email au destinataire).

Configuration : copier `.env.example` → `.env` et renseigner :
- `API_KEY` (secret partagé client/server)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`
- `FROM_EMAIL`, `ADMIN_EMAIL`

Démarrage serveur :
```bash
cd server
npm install
npm start
