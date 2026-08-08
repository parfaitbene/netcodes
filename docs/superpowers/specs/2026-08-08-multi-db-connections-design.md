# NetCodes 2.0.0 — Connexions multi-bases (SQLite, MySQL, PostgreSQL)

Date : 2026-08-08
Branche : `2.0.0`
Statut : validé (design approuvé en session)

## Contexte et objectif

NetCodes 1.x ouvre une seule base SQLite locale, choisie dans les paramètres, avec
redémarrage de l'application à chaque changement. Ce modèle a deux limites :

1. Impossible de partager une base entre plusieurs postes autrement que par
   synchronisation de fichier (OneDrive), source avérée de corruption SQLite
   (incident du 2026-08-08, données récupérées).
2. Impossible d'organiser des contextes séparés (perso, travail, client X)
   sans jongler manuellement entre fichiers.

La 2.0.0 introduit des **connexions multiples et simultanées** vers des bases
SQLite (fichier), MySQL et PostgreSQL (serveur). Toutes les connexions sont
visibles en même temps dans la sidebar, chacune étant un silo de données
indépendant.

## Décisions validées

| Sujet | Décision |
|---|---|
| Mode d'affichage | Simultané : chaque connexion = groupe racine dans la sidebar |
| Recherche | Mono-base : un sélecteur de connexion dans le modal de recherche |
| Transfert inter-bases | Hors périmètre v1 (copie/migration envisagées pour 2.1) |
| Mots de passe | Chiffrés via Electron `safeStorage` (DPAPI/Keychain), jamais en clair sur disque, jamais envoyés au renderer |
| Reconnexion | Automatique au démarrage pour toutes les connexions enregistrées ; échec → statut erreur + bouton « Reconnecter », app utilisable |
| Approche technique | Adaptateurs par moteur (pas d'ORM) : SQL brut conservé, contrat commun async |

## Architecture

### Couche données (process main)

Nouveau dossier `electron/db/` :

```
electron/db/
├── adapter.js            # contrat commun (classe abstraite DbAdapter)
├── sqlite-adapter.js     # wrap better-sqlite3 (API sync → contrat async)
├── mysql-adapter.js      # mysql2/promise
├── postgres-adapter.js   # pg
├── connection-manager.js # registre des connexions ouvertes + cycle de vie
└── schema/
    ├── sqlite.sql
    ├── mysql.sql
    └── postgres.sql
```

**Contrat `DbAdapter`** — toutes les méthodes async :

- `all(sql, params)` → tableau de lignes
- `get(sql, params)` → une ligne ou `undefined`
- `run(sql, params)` → `{ changes }`
- `insert(sql, params)` → id auto-généré (SQLite : `lastInsertRowid` ;
  MySQL : `insertId` ; PostgreSQL : l'adaptateur suffixe `RETURNING id`)
- `exec(sql)` — scripts multi-instructions (création de schéma)
- `transaction(fn)` — `fn` reçoit l'adaptateur, BEGIN/COMMIT/ROLLBACK gérés
- `close()`, propriété `dialect`
- Placeholders : les ops écrivent `?` partout ; l'adaptateur PostgreSQL
  convertit en `$1, $2…` avant exécution.

**`ConnectionManager`** :

- `openAll()` au démarrage : ouvre toutes les connexions enregistrées en
  parallèle ; un échec n'empêche ni le démarrage ni les autres connexions.
- `open(config)`, `get(id)` (jette si non connectée), `close(id)`, `closeAll()`,
  `status(id)` → `{ state: 'connected'|'connecting'|'error'|'closed', error? }`.
- À l'ouverture : exécution du schéma du dialecte (`CREATE TABLE IF NOT EXISTS`) ;
  pour SQLite, contrôle `integrity_check` conservé (fix 1.0.1) — corruption →
  statut `error` avec message explicite, plus de dialog bloquant.
- Timeout d'ouverture MySQL/PostgreSQL : 5 secondes.
- Événement `status-changed` relayé au renderer à chaque transition.

**Configuration** — `settings.json` (userData) :

```json
{
  "connections": [
    { "id": "a1b2", "name": "Perso", "type": "sqlite",
      "file": "/chemin/vers/netcodes.sqlite" },
    { "id": "c3d4", "name": "Travail", "type": "postgres",
      "host": "10.0.0.5", "port": 5432, "database": "netcodes",
      "user": "app", "passwordEnc": "<safeStorage base64>" }
  ]
}
```

- `id` : identifiant court aléatoire, stable, généré à la création.
- **Migration automatique** : au premier lancement 2.0.0, si l'ancien champ
  `dbPath` existe (ou à défaut le chemin par défaut userData), il est converti
  en connexion SQLite nommée « Base locale », puis `dbPath` est supprimé.

**`database.js`** : les six groupes d'ops (`notebookOps`, `sectionOps`,
`pageOps`, `blockOps`, `tagOps`, `searchOps`) conservent leur SQL mais chaque
fonction devient `async` et prend `connId` en premier argument ; le corps
résout l'adaptateur via le manager. `initDatabase`/`getDatabase`/`closeDatabase`
disparaissent au profit du manager.

### Schémas par dialecte

Mêmes six tables (notebooks, sections, pages, blocks, tags, page_tags),
mêmes index, mêmes contraintes (`CHECK(type IN (…))`, FK `ON DELETE CASCADE`).
Différences confinées :

| Élément | SQLite | MySQL (≥ 8.0.16) | PostgreSQL |
|---|---|---|---|
| PK auto | `INTEGER PRIMARY KEY AUTOINCREMENT` | `INT AUTO_INCREMENT PRIMARY KEY` | `INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY` |
| Horodatage | `DATETIME DEFAULT CURRENT_TIMESTAMP` | `DATETIME DEFAULT CURRENT_TIMESTAMP` | `TIMESTAMP DEFAULT CURRENT_TIMESTAMP` |
| Contenu de bloc | `TEXT` | `LONGTEXT` | `TEXT` |

`updated_at` reste géré par le code (`SET updated_at = CURRENT_TIMESTAMP` dans
les UPDATE) — aucun trigger.

### IPC et preload

- **Canaux existants** : `connId` ajouté en premier paramètre partout
  (notebooks, sections, pages, blocks, tags, export, `search:query(connId, q)`).
- **Nouveaux canaux** :

| Canal | Rôle |
|---|---|
| `connections:list` | Métadonnées d'affichage : `{id, name, type, status}` — ni host, ni user, ni mot de passe |
| `connections:add` / `update` / `remove` | CRUD de la config ; chiffrement du mot de passe côté main |
| `connections:test` | Essai de connexion avec une config fournie, sans enregistrement |
| `connections:reconnect` | Ré-ouverture d'une connexion en erreur |
| `connections:status-changed` | Push main → renderer sur transition d'état |

- `preload.cjs` : miroir 1:1 des canaux, plus `onConnectionStatusChanged(cb)`.

### UI renderer

- **Sidebar** : groupes racine = connexions. En-tête : icône moteur, nom,
  pastille d'état (vert/rouge/gris), repli. Sous chaque groupe : l'arborescence
  notebooks actuelle, inchangée. Groupe en erreur : grisé + bouton
  « Reconnecter ».
- **État global** : liste des connexions et statuts ; toute sélection devient
  une paire `{connId, id}`. Une seule sélection active toutes bases confondues.
- **Modal « Connexions »** (remplace « Choisir la base de données », l'entrée de
  menu ouvre ce modal) : liste, ajout/édition avec champs selon le type
  (fichier pour SQLite ; host/port/database/user/mot de passe pour serveur),
  bouton « Tester la connexion », suppression avec confirmation (retire la
  connexion, ne touche jamais aux données). Ouverture/fermeture à chaud, sans
  redémarrage de l'application.
- **SearchModal** : sélecteur de connexion en tête des filtres, défaut =
  connexion de la sélection courante.
- **MoveModal** : cibles restreintes à la connexion de l'élément déplacé.
- **Favoris** : par connexion, affichés sous leur groupe respectif.

### Erreurs et résilience

- Échec d'ouverture (timeout, refus, corruption SQLite) → statut `error` avec
  message, app pleinement utilisable sur les autres connexions.
- Erreur en cours d'usage (serveur tombé) : rejet IPC → bandeau non bloquant
  dans le panneau concerné, statut passe à rouge.
- Fermeture de l'app : `closeAll()`.

## Tests

- **Contract test adaptateurs** (`tests/adapter-contract.test.js`) : suite
  unique exécutée sur les trois adaptateurs — CRUD, transaction (commit et
  rollback), id d'insertion, conversion de placeholders. SQLite : toujours
  (in-memory). MySQL/PostgreSQL : uniquement si `TEST_MYSQL_URL` /
  `TEST_PG_URL` sont définies, sinon skip ; `docker-compose.test.yml` fournit
  les deux serveurs.
- **Ops** : tests existants adaptés (async + `connId`) sur SQLite in-memory.
- **ConnectionManager** : ouverture, migration de l'ancien `dbPath`, statut
  `error` sur fichier corrompu, reconnexion.

## Hors périmètre v1

- Copie/déplacement/migration de données entre connexions (cible 2.1).
- Recherche multi-bases simultanée.
- Pool de connexions avancé, SSL/TLS paramétrable MySQL/PG (défauts des
  drivers utilisés tels quels).

## Critères de succès

1. Trois connexions (SQLite + MySQL + PostgreSQL) visibles et utilisables
   simultanément dans la sidebar.
2. Serveur MySQL/PG coupé → l'app démarre, le groupe est en erreur,
   « Reconnecter » fonctionne une fois le serveur revenu.
3. Migration transparente depuis 1.x : l'ancienne base apparaît comme
   « Base locale » avec toutes ses données.
4. Aucun mot de passe en clair dans `settings.json` ni transmis au renderer.
5. Suite de tests verte (SQLite in-memory) ; contract tests verts avec les
   serveurs docker de test.

## Dépendances ajoutées

- `mysql2` (driver MySQL, API promesses)
- `pg` (driver PostgreSQL)
