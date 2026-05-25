# Roadmap — Ti Cochon Coffre

## Phase 0 — Prototype actuel

Statut : en cours.

- Landing page premium.
- Frontend local-first.
- Simulation MonCash.
- Transfert P2P local.
- Serveur prototype Express.
- Ledger serveur fichier JSON.
- Notifications email optionnelles.

---

## Phase 1 — Stabilisation MVP

Objectif : rendre le prototype plus fiable pour tests utilisateurs.

- Refactor frontend en modules : `auth`, `ledger`, `router`, `ui`, `api`.
- Remplacer les mots de passe frontend par une auth serveur.
- Ajouter une base SQLite ou PostgreSQL.
- Créer des endpoints :
  - `POST /auth/signup`
  - `POST /auth/login`
  - `POST /transactions/deposit`
  - `POST /transactions/withdraw`
  - `POST /transactions/p2p`
  - `GET /transactions/me`
- Ajouter des statuts : `pending`, `confirmed`, `failed`, `reversed`.
- Ajouter une page admin simple.

---

## Phase 2 — MVP business testable

Objectif : tester avec un petit groupe fermé.

- Dashboard admin.
- Gestion des utilisateurs.
- Export CSV.
- Reçus PDF.
- Notifications email/WhatsApp.
- Rôles : admin, agent, utilisateur.
- Limites journalières.
- Journal d'audit.
- Sauvegardes automatiques.

---

## Phase 3 — Intégration paiement

Objectif : préparer une vraie logique fintech.

- Webhooks MonCash signés.
- Vérification de référence transaction.
- Idempotency key pour éviter les doubles crédits.
- Reconciliation admin.
- Statut transactionnel complet.
- Alertes de transaction suspecte.

---

## Phase 4 — Production contrôlée

Objectif : version utilisable en vrai environnement.

- Déploiement backend sécurisé.
- HTTPS strict.
- Secrets via variables d'environnement.
- Base PostgreSQL.
- Backups.
- Monitoring.
- Logs structurés.
- Politique de confidentialité.
- Conditions d'utilisation.

---

## Priorité immédiate recommandée

1. Remplacer le ledger fichier JSON par SQLite.
2. Ajouter auth serveur.
3. Séparer frontend demo et frontend connecté.
4. Créer dashboard admin minimal.
5. Ajouter reçus PDF/CSV.
