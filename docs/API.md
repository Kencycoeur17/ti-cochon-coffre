# API — Ti Cochon Coffre SQLite MVP

Base URL locale par défaut :

```txt
http://localhost:3000
```

---

## 1. Health check

```bash
curl http://localhost:3000/health
```

Réponse attendue :

```json
{
  "ok": true,
  "app": "ti-cochon-coffre-server",
  "mode": "prototype",
  "storage": "sqlite"
}
```

---

## 2. Créer un compte serveur

```bash
curl -X POST http://localhost:3000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Demo Server","email":"demo-server@example.com","password":"demo12345"}'
```

Réponse :

```json
{
  "ok": true,
  "user": {
    "id": "usr_xxx",
    "name": "Demo Server",
    "email": "demo-server@example.com"
  },
  "session": {
    "token": "...",
    "expiresAt": "..."
  }
}
```

---

## 3. Connexion

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo-server@example.com","password":"demo12345"}'
```

Copier le token retourné pour les routes protégées.

---

## 4. Profil connecté

```bash
curl http://localhost:3000/auth/me \
  -H "Authorization: Bearer TOKEN_ICI"
```

---

## 5. Dépôt serveur

```bash
curl -X POST http://localhost:3000/transactions/deposit \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN_ICI" \
  -H "Idempotency-Key: dep-demo-001" \
  -d '{"amount":25,"note":"Premier dépôt serveur"}'
```

---

## 6. Retrait serveur

```bash
curl -X POST http://localhost:3000/transactions/withdraw \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN_ICI" \
  -H "Idempotency-Key: wit-demo-001" \
  -d '{"amount":5,"note":"Retrait test"}'
```

---

## 7. Transfert P2P serveur

Créer d'abord un deuxième compte, puis :

```bash
curl -X POST http://localhost:3000/transactions/p2p \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN_ICI" \
  -H "Idempotency-Key: p2p-demo-001" \
  -d '{"to":"second@example.com","amount":3,"note":"Test P2P"}'
```

---

## 8. Solde connecté

```bash
curl http://localhost:3000/me/balance \
  -H "Authorization: Bearer TOKEN_ICI"
```

---

## 9. Historique connecté

```bash
curl http://localhost:3000/me/transactions \
  -H "Authorization: Bearer TOKEN_ICI"
```

---

## 10. Route MonCash prototype par API key

Cette route est conservée pour simulation legacy. Elle ne remplace pas un vrai webhook MonCash.

```bash
curl -X POST http://localhost:3000/moncash \
  -H "Content-Type: application/json" \
  -H "x-api-key: change-me-long-random-dev-key" \
  -H "Idempotency-Key: mc-demo-001" \
  -d '{"to":"demo-server@example.com","amount":10,"ref":"MC-DEMO-001"}'
```

---

## 11. Connecter le frontend au serveur

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
