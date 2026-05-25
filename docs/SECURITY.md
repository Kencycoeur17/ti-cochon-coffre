# Security Notes — Ti Cochon Coffre

## Statut de sécurité

Ti Cochon Coffre est actuellement un **prototype**. Il ne doit pas être utilisé pour gérer de l'argent réel.

---

## Risques actuels

| Risque | Niveau | Détail |
|---|---:|---|
| Stockage frontend | Critique | `localStorage` et `sessionStorage` peuvent être modifiés par l'utilisateur. |
| Auth locale | Critique | Le mot de passe frontend n'est pas une vraie sécurité. |
| Ledger local | Critique | Le solde local ne peut pas être considéré fiable. |
| API key frontend | Élevé | Une API key exposée côté navigateur ne protège pas une vraie API. |
| Ledger JSON | Moyen | Le stockage fichier est acceptable pour test, pas production. |
| Email SMTP | Moyen | Les secrets SMTP doivent rester uniquement côté serveur. |
| MonCash simulé | Moyen | Aucun vrai paiement n'est vérifié. |

---

## Règles avant production

1. Aucun solde ne doit être calculé côté frontend.
2. Aucun secret ne doit être envoyé dans le navigateur.
3. Toute transaction doit être créée côté serveur.
4. Toute transaction doit avoir un statut.
5. Toute transaction entrante doit avoir une clé d'idempotence.
6. Tout webhook doit être signé et vérifié.
7. Toute action admin doit être journalisée.
8. Les exports doivent masquer les données sensibles.

---

## Architecture sécurisée recommandée

```txt
Frontend
  ↓ HTTPS
Backend API
  ↓
Auth service + Transaction service
  ↓
PostgreSQL / SQLite MVP
  ↓
Audit logs + backups
```

---

## Mesures MVP minimales

- Auth serveur avec hash `bcrypt` ou `argon2`.
- Sessions signées ou JWT court.
- Rate limit robuste.
- CORS limité au domaine officiel.
- Validation stricte des entrées.
- Ledger append-only.
- Idempotency key sur dépôts.
- Export CSV/PDF côté serveur.
- Backups automatiques.

---

## MonCash / paiement

Pour une future intégration MonCash réelle :

- ne jamais créditer un compte depuis une demande frontend seule ;
- vérifier la transaction côté serveur ;
- utiliser une référence unique ;
- empêcher le double crédit ;
- enregistrer les événements `pending`, `confirmed`, `failed`, `reversed` ;
- mettre en place une procédure de réconciliation admin.

---

## Note légale

Ce projet est un prototype éducatif et MVP. Toute utilisation financière réelle doit être précédée d'une analyse légale, conformité, sécurité et gestion des risques opérationnels.
