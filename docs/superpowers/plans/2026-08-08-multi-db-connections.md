# Multi-Database Connections (2.0.0) Implementation Plan

> **Statut : exécuté.** Ce plan est un document historique. Plusieurs écarts
> délibérés ont été décidés pendant l'exécution (règle de sécurité sur la
> réutilisation d'un mot de passe stocké, sélecteur de fichier natif au lieu
> d'une saisie libre, abandon des favoris par connexion et du `REINDEX` au
> démarrage). **La spec fait foi**, pas ce plan :
> `docs/superpowers/specs/2026-08-08-multi-db-connections-design.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** NetCodes se connecte simultanément à plusieurs bases (SQLite, MySQL, PostgreSQL), chacune affichée comme groupe racine dans la sidebar, avec reconnexion automatique au démarrage.

**Architecture:** Couche d'adaptateurs par moteur derrière un contrat async commun (`DbAdapter`), registre de connexions (`ConnectionManager`) dans le process main, `connId` propagé sur tous les canaux IPC, entités taguées `connId` côté renderer. Spec : `docs/superpowers/specs/2026-08-08-multi-db-connections-design.md`.

**Tech Stack:** Electron 40 (ESM main, preload CJS), better-sqlite3, mysql2, pg, React 18, Vite, Vitest.

## Global Constraints

- Branche : `2.0.0`. Commits Conventional Commits. **JAMAIS de `git push` sans accord explicite de l'utilisateur.**
- Textes UI en français ; identifiants/code en anglais.
- **ABI better-sqlite3** : le module natif est compilé pour Electron. Avant TOUTE exécution vitest : `npm run rebuild:node`. Avant tout lancement de l'app Electron : `npm run rebuild:electron`. Une seule fois par bascule, pas à chaque test.
- `package.json` a `"type": "module"` → fichiers `electron/**` en ESM ; `preload.cjs` reste CommonJS.
- Les mots de passe ne transitent JAMAIS vers le renderer et ne sont jamais écrits en clair sur disque (`safeStorage`).
- La colonne `favorite` est un entier 0/1 sur les trois moteurs (jamais BOOLEAN).
- Les ops écrivent les placeholders `?` ; seule la couche adaptateur traduit (PostgreSQL `$n`).

---

### Task 1: Contrat `DbAdapter` + `SqliteAdapter` + contract test

**Files:**
- Create: `electron/db/adapter.js`
- Create: `electron/db/sqlite-adapter.js`
- Create: `tests/helpers/adapter-contract.js`
- Create: `tests/adapter-contract.test.js`

**Interfaces:**
- Produces: classe `DbAdapter` (contrat) ; classe `SqliteAdapter` — `new SqliteAdapter({ file })`, `await open()`, `await all(sql, params)`, `await get(sql, params)`, `await run(sql, params)` → `{ changes }`, `await insert(sql, params)` → id numérique, `await exec(sql)`, `await transaction(fn)`, `await close()`, propriété `dialect`.
- Produces: `adapterContract(name, { makeAdapter, itemsDdl, enabled })` — suite de tests réutilisée par les tasks 3 et 4.

- [ ] **Step 1: Écrire le contract test (échoue : modules absents)**

`tests/helpers/adapter-contract.js` :

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// Suite exécutée à l'identique sur chaque adaptateur.
// makeAdapter: () => Promise<DbAdapter> (déjà open()).
// itemsDdl: DDL de la table de test dans le dialecte de l'adaptateur.
export function adapterContract(name, { makeAdapter, itemsDdl, enabled = true }) {
  const d = enabled ? describe : describe.skip;
  d(`adapter contract: ${name}`, () => {
    let a;

    beforeEach(async () => {
      a = await makeAdapter();
      await a.exec('DROP TABLE IF EXISTS items');
      await a.exec(itemsDdl);
    });

    afterEach(async () => {
      if (a) {
        await a.exec('DROP TABLE IF EXISTS items');
        await a.close();
        a = null;
      }
    });

    it('insert retourne un id auto-généré croissant', async () => {
      const id1 = await a.insert('INSERT INTO items (name, qty) VALUES (?, ?)', ['a', 1]);
      const id2 = await a.insert('INSERT INTO items (name, qty) VALUES (?, ?)', ['b', 2]);
      expect(typeof id1).toBe('number');
      expect(id2).toBeGreaterThan(id1);
    });

    it('get et all avec placeholders ?', async () => {
      await a.insert('INSERT INTO items (name, qty) VALUES (?, ?)', ['x', 10]);
      await a.insert('INSERT INTO items (name, qty) VALUES (?, ?)', ['y', 20]);
      const row = await a.get('SELECT name, qty FROM items WHERE name = ?', ['x']);
      expect(row.qty).toBe(10);
      const rows = await a.all('SELECT name FROM items WHERE qty > ? ORDER BY qty', [5]);
      expect(rows.map(r => r.name)).toEqual(['x', 'y']);
      expect(await a.get('SELECT 1 AS one FROM items WHERE name = ?', ['zzz'])).toBeUndefined();
    });

    it('run retourne le nombre de lignes modifiées', async () => {
      await a.insert('INSERT INTO items (name, qty) VALUES (?, ?)', ['x', 1]);
      await a.insert('INSERT INTO items (name, qty) VALUES (?, ?)', ['y', 1]);
      const r = await a.run('UPDATE items SET qty = ? WHERE qty = ?', [5, 1]);
      expect(r.changes).toBe(2);
    });

    it('transaction commit', async () => {
      await a.transaction(async (tx) => {
        await tx.insert('INSERT INTO items (name, qty) VALUES (?, ?)', ['t', 1]);
      });
      expect((await a.all('SELECT * FROM items')).length).toBe(1);
    });

    it('transaction rollback sur erreur', async () => {
      await expect(a.transaction(async (tx) => {
        await tx.insert('INSERT INTO items (name, qty) VALUES (?, ?)', ['t', 1]);
        throw new Error('boom');
      })).rejects.toThrow('boom');
      expect((await a.all('SELECT * FROM items')).length).toBe(0);
    });
  });
}
```

`tests/adapter-contract.test.js` :

```js
import { adapterContract } from './helpers/adapter-contract.js';
import { SqliteAdapter } from '../electron/db/sqlite-adapter.js';

adapterContract('sqlite', {
  makeAdapter: async () => {
    const a = new SqliteAdapter({ file: ':memory:' });
    await a.open();
    return a;
  },
  itemsDdl: `CREATE TABLE items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    qty INT DEFAULT 0
  )`,
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npm run rebuild:node` (une fois), puis `npx vitest run tests/adapter-contract.test.js`
Expected: FAIL — `Cannot find module '../electron/db/sqlite-adapter.js'`

- [ ] **Step 3: Implémenter `adapter.js` + `sqlite-adapter.js`**

`electron/db/adapter.js` :

```js
// Contrat commun des adaptateurs de base de données.
// Toutes les méthodes sont async ; les ops écrivent des placeholders `?`,
// chaque adaptateur traduit vers son dialecte si nécessaire.
export class DbAdapter {
  constructor(dialect) {
    this.dialect = dialect;
  }
  async open() { throw new Error('not implemented'); }
  async all(_sql, _params = []) { throw new Error('not implemented'); }
  async get(_sql, _params = []) { throw new Error('not implemented'); }
  async run(_sql, _params = []) { throw new Error('not implemented'); }
  async insert(_sql, _params = []) { throw new Error('not implemented'); }
  async exec(_sql) { throw new Error('not implemented'); }
  async transaction(_fn) { throw new Error('not implemented'); }
  async close() { throw new Error('not implemented'); }
}
```

`electron/db/sqlite-adapter.js` :

```js
import Database from 'better-sqlite3';
import { DbAdapter } from './adapter.js';

export class SqliteAdapter extends DbAdapter {
  constructor(config) {
    super('sqlite');
    this.config = config;
    this.db = null;
  }

  async open() {
    this.db = new Database(this.config.file);
    // Une base corrompue peut jeter dès le premier pragma (SQLITE_CORRUPT)
    // ou seulement être signalée par integrity_check : on unifie les deux cas.
    let corruptionDetail = null;
    try {
      this.db.pragma('journal_mode = WAL');
      const integrity = this.db.pragma('integrity_check');
      if (!(integrity.length === 1 && integrity[0].integrity_check === 'ok')) {
        corruptionDetail = `${integrity.length} erreur(s) d'intégrité SQLite détectée(s).`;
      }
    } catch (err) {
      corruptionDetail = err.message;
    }
    if (corruptionDetail) {
      this.db.close();
      this.db = null;
      throw new Error(`Base de données corrompue : ${this.config.file}\n${corruptionDetail}`);
    }
  }

  async all(sql, params = []) { return this.db.prepare(sql).all(...params); }
  async get(sql, params = []) { return this.db.prepare(sql).get(...params); }
  async run(sql, params = []) {
    const r = this.db.prepare(sql).run(...params);
    return { changes: r.changes };
  }
  async insert(sql, params = []) {
    return Number(this.db.prepare(sql).run(...params).lastInsertRowid);
  }
  async exec(sql) { this.db.exec(sql); }

  async transaction(fn) {
    this.db.exec('BEGIN');
    try {
      const out = await fn(this);
      this.db.exec('COMMIT');
      return out;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  async close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
```

Note : le mode WAL échoue silencieusement sur `:memory:` (pas grave). Le contrôle d'intégrité reprend exactement la logique du fix 1.0.1 — `initDatabase` disparaîtra en Task 5.

- [ ] **Step 4: Vérifier le vert**

Run: `npx vitest run tests/adapter-contract.test.js`
Expected: PASS — 5 tests sqlite.

- [ ] **Step 5: Commit**

```bash
git add electron/db/adapter.js electron/db/sqlite-adapter.js tests/helpers/adapter-contract.js tests/adapter-contract.test.js
git commit -m "feat(db): add DbAdapter contract and SqliteAdapter with contract tests"
```

---

### Task 2: Schémas par dialecte

**Files:**
- Create: `electron/db/schema/sqlite.sql` (déplacement de `electron/schema.sql`, contenu inchangé)
- Create: `electron/db/schema/mysql.sql`
- Create: `electron/db/schema/postgres.sql`
- Create: `tests/schema.test.js`
- Delete: `electron/schema.sql` (à la Task 5, quand plus rien ne le lit)

**Interfaces:**
- Produces: trois fichiers DDL idempotents (`CREATE TABLE IF NOT EXISTS`), mêmes tables/colonnes/index. Chargés par `ConnectionManager` (Task 5) via `schema/<type>.sql`.

- [ ] **Step 1: Test (échoue : fichiers absents)**

`tests/schema.test.js` :

```js
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SqliteAdapter } from '../electron/db/sqlite-adapter.js';

const schemaDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../electron/db/schema');
const TABLES = ['notebooks', 'sections', 'pages', 'blocks', 'tags', 'page_tags'];

describe('schemas', () => {
  it('les trois fichiers existent et déclarent les six tables', () => {
    for (const dialect of ['sqlite', 'mysql', 'postgres']) {
      const sql = fs.readFileSync(path.join(schemaDir, `${dialect}.sql`), 'utf-8');
      for (const t of TABLES) {
        expect(sql, `${dialect}.sql doit créer ${t}`).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS ${t}`, 'i'));
      }
      expect(sql).not.toMatch(/favorite\s+BOOLEAN/i);
    }
  });

  it('sqlite.sql s\'applique deux fois sans erreur (idempotent)', async () => {
    const a = new SqliteAdapter({ file: ':memory:' });
    await a.open();
    const sql = fs.readFileSync(path.join(schemaDir, 'sqlite.sql'), 'utf-8');
    await a.exec(sql);
    await a.exec(sql);
    const rows = await a.all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
    expect(rows.map(r => r.name).sort()).toEqual([...TABLES].sort());
    await a.close();
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run tests/schema.test.js`
Expected: FAIL — `ENOENT ... schema/sqlite.sql`

- [ ] **Step 3: Créer les trois fichiers**

`git mv electron/schema.sql electron/db/schema/sqlite.sql` (contenu inchangé — `electron/database.js` le lit encore via l'ancien chemin jusqu'à la Task 5 : recopier temporairement le fichier au lieu de le déplacer si les tests existants cassent ; le doublon `electron/schema.sql` est supprimé Task 5).

`electron/db/schema/mysql.sql` (index déclarés inline : MySQL ne supporte pas `CREATE INDEX IF NOT EXISTS`) :

```sql
CREATE TABLE IF NOT EXISTS notebooks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    icon VARCHAR(16) DEFAULT '📓',
    position INT NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sections (
    id INT AUTO_INCREMENT PRIMARY KEY,
    notebook_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    color VARCHAR(16) DEFAULT '#007bff',
    position INT NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_sections_notebook (notebook_id),
    CONSTRAINT fk_sections_notebook FOREIGN KEY (notebook_id) REFERENCES notebooks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    section_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    position INT NOT NULL DEFAULT 0,
    favorite INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_pages_section (section_id),
    CONSTRAINT fk_pages_section FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS blocks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    page_id INT NOT NULL,
    type VARCHAR(16) NOT NULL CHECK (type IN ('text', 'code', 'attachment')),
    title VARCHAR(255),
    content LONGTEXT,
    language VARCHAR(32),
    filename VARCHAR(255),
    filepath TEXT,
    position INT NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_blocks_page (page_id),
    CONSTRAINT fk_blocks_page FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tags (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(191) NOT NULL UNIQUE,
    color VARCHAR(16) DEFAULT '#6c757d'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS page_tags (
    page_id INT NOT NULL,
    tag_id INT NOT NULL,
    PRIMARY KEY (page_id, tag_id),
    INDEX idx_page_tags_tag (tag_id),
    CONSTRAINT fk_page_tags_page FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE,
    CONSTRAINT fk_page_tags_tag FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

`electron/db/schema/postgres.sql` :

```sql
CREATE TABLE IF NOT EXISTS notebooks (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT DEFAULT '📓',
    position INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sections (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    notebook_id INT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    color TEXT DEFAULT '#007bff',
    position INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pages (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    section_id INT NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    position INT NOT NULL DEFAULT 0,
    favorite INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS blocks (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    page_id INT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('text', 'code', 'attachment')),
    title TEXT,
    content TEXT,
    language TEXT,
    filename TEXT,
    filepath TEXT,
    position INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tags (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color TEXT DEFAULT '#6c757d'
);

CREATE TABLE IF NOT EXISTS page_tags (
    page_id INT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    tag_id INT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (page_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_sections_notebook ON sections(notebook_id);
CREATE INDEX IF NOT EXISTS idx_pages_section ON pages(section_id);
CREATE INDEX IF NOT EXISTS idx_blocks_page ON blocks(page_id);
CREATE INDEX IF NOT EXISTS idx_page_tags_page ON page_tags(page_id);
CREATE INDEX IF NOT EXISTS idx_page_tags_tag ON page_tags(tag_id);
```

- [ ] **Step 4: Vérifier le vert**

Run: `npx vitest run tests/schema.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add electron/db/schema/ tests/schema.test.js electron/schema.sql
git commit -m "feat(db): add per-dialect schema files (sqlite, mysql, postgres)"
```

---

### Task 3: `PostgresAdapter` + docker-compose de test

**Files:**
- Create: `electron/db/postgres-adapter.js`
- Create: `docker-compose.test.yml`
- Modify: `tests/adapter-contract.test.js` (ajout du bloc postgres)
- Modify: `package.json` (dépendance `pg`)

**Interfaces:**
- Consumes: `DbAdapter` (Task 1), `adapterContract` (Task 1).
- Produces: `PostgresAdapter` — `new PostgresAdapter({ host, port, database, user, password })`, même contrat. `insert()` suffixe `RETURNING id`.

- [ ] **Step 1: Installer la dépendance**

Run: `npm install pg`

- [ ] **Step 2: docker-compose de test**

`docker-compose.test.yml` :

```yaml
# Serveurs jetables pour les contract tests MySQL/PostgreSQL.
# docker compose -f docker-compose.test.yml up -d
# TEST_PG_URL=postgres://netcodes:netcodes@localhost:5433/netcodes_test
# TEST_MYSQL_URL=mysql://netcodes:netcodes@localhost:3307/netcodes_test
services:
  pg-test:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: netcodes
      POSTGRES_PASSWORD: netcodes
      POSTGRES_DB: netcodes_test
    ports:
      - "5433:5432"
  mysql-test:
    image: mysql:8.4
    environment:
      MYSQL_ROOT_PASSWORD: netcodes
      MYSQL_DATABASE: netcodes_test
      MYSQL_USER: netcodes
      MYSQL_PASSWORD: netcodes
    ports:
      - "3307:3306"
```

- [ ] **Step 3: Étendre le contract test (échoue : module absent)**

Ajouter à `tests/adapter-contract.test.js` :

```js
import { PostgresAdapter } from '../electron/db/postgres-adapter.js';

const PG_URL = process.env.TEST_PG_URL;

function pgConfigFromUrl(urlStr) {
  const u = new URL(urlStr);
  return {
    host: u.hostname,
    port: Number(u.port || 5432),
    database: u.pathname.slice(1),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
  };
}

adapterContract('postgres', {
  enabled: Boolean(PG_URL),
  makeAdapter: async () => {
    const a = new PostgresAdapter(pgConfigFromUrl(PG_URL));
    await a.open();
    return a;
  },
  itemsDdl: `CREATE TABLE items (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL,
    qty INT DEFAULT 0
  )`,
});
```

- [ ] **Step 4: Implémenter**

`electron/db/postgres-adapter.js` :

```js
import pg from 'pg';
import { DbAdapter } from './adapter.js';

// Convertit les placeholders `?` en `$1, $2…`.
// Sûr ici : aucun `?` littéral dans le SQL des ops (les valeurs passent en params).
function toPgPlaceholders(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

export class PostgresAdapter extends DbAdapter {
  constructor(config) {
    super('postgres');
    this.config = config;
    this.client = null;
  }

  async open() {
    this.client = new pg.Client({
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.user,
      password: this.config.password,
      connectionTimeoutMillis: 5000,
    });
    await this.client.connect();
  }

  async all(sql, params = []) {
    const r = await this.client.query(toPgPlaceholders(sql), params);
    return r.rows;
  }
  async get(sql, params = []) {
    return (await this.all(sql, params))[0];
  }
  async run(sql, params = []) {
    const r = await this.client.query(toPgPlaceholders(sql), params);
    return { changes: r.rowCount ?? 0 };
  }
  async insert(sql, params = []) {
    const r = await this.client.query(`${toPgPlaceholders(sql)} RETURNING id`, params);
    return r.rows[0].id;
  }
  async exec(sql) {
    await this.client.query(sql);
  }

  async transaction(fn) {
    await this.client.query('BEGIN');
    try {
      const out = await fn(this);
      await this.client.query('COMMIT');
      return out;
    } catch (err) {
      await this.client.query('ROLLBACK');
      throw err;
    }
  }

  async close() {
    if (this.client) {
      await this.client.end();
      this.client = null;
    }
  }
}
```

- [ ] **Step 5: Vérifier — skip sans env, vert avec docker**

Run: `npx vitest run tests/adapter-contract.test.js`
Expected: PASS sqlite, SKIP postgres.

Run: `docker compose -f docker-compose.test.yml up -d pg-test`, puis
`TEST_PG_URL=postgres://netcodes:netcodes@localhost:5433/netcodes_test npx vitest run tests/adapter-contract.test.js`
(PowerShell : `$env:TEST_PG_URL='postgres://netcodes:netcodes@localhost:5433/netcodes_test'; npx vitest run tests/adapter-contract.test.js`)
Expected: PASS sqlite + postgres (10 tests).

- [ ] **Step 6: Commit**

```bash
git add electron/db/postgres-adapter.js docker-compose.test.yml tests/adapter-contract.test.js package.json package-lock.json
git commit -m "feat(db): add PostgresAdapter with placeholder translation and RETURNING id"
```

---

### Task 4: `MySqlAdapter`

**Files:**
- Create: `electron/db/mysql-adapter.js`
- Modify: `tests/adapter-contract.test.js` (ajout du bloc mysql)
- Modify: `package.json` (dépendance `mysql2`)

**Interfaces:**
- Consumes: `DbAdapter`, `adapterContract`.
- Produces: `MySqlAdapter` — `new MySqlAdapter({ host, port, database, user, password })`, même contrat.

- [ ] **Step 1: Installer la dépendance**

Run: `npm install mysql2`

- [ ] **Step 2: Étendre le contract test**

Ajouter à `tests/adapter-contract.test.js` :

```js
import { MySqlAdapter } from '../electron/db/mysql-adapter.js';

const MYSQL_URL = process.env.TEST_MYSQL_URL;

function mysqlConfigFromUrl(urlStr) {
  const u = new URL(urlStr);
  return {
    host: u.hostname,
    port: Number(u.port || 3306),
    database: u.pathname.slice(1),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
  };
}

adapterContract('mysql', {
  enabled: Boolean(MYSQL_URL),
  makeAdapter: async () => {
    const a = new MySqlAdapter(mysqlConfigFromUrl(MYSQL_URL));
    await a.open();
    return a;
  },
  itemsDdl: `CREATE TABLE items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    qty INT DEFAULT 0
  )`,
});
```

- [ ] **Step 3: Implémenter**

`electron/db/mysql-adapter.js` :

```js
import mysql from 'mysql2/promise';
import { DbAdapter } from './adapter.js';

export class MySqlAdapter extends DbAdapter {
  constructor(config) {
    super('mysql');
    this.config = config;
    this.conn = null;
  }

  async open() {
    this.conn = await mysql.createConnection({
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.user,
      password: this.config.password,
      connectTimeout: 5000,
      // Dates en chaînes 'YYYY-MM-DD HH:MM:SS' comme SQLite, pas en objets Date.
      dateStrings: true,
      // Nécessaire pour exécuter les fichiers schema/*.sql multi-instructions.
      multipleStatements: true,
      enableKeepAlive: true,
    });
  }

  async all(sql, params = []) {
    const [rows] = await this.conn.execute(sql, params);
    return rows;
  }
  async get(sql, params = []) {
    return (await this.all(sql, params))[0];
  }
  async run(sql, params = []) {
    const [r] = await this.conn.execute(sql, params);
    return { changes: r.affectedRows ?? 0 };
  }
  async insert(sql, params = []) {
    const [r] = await this.conn.execute(sql, params);
    return r.insertId;
  }
  async exec(sql) {
    await this.conn.query(sql);
  }

  async transaction(fn) {
    await this.conn.beginTransaction();
    try {
      const out = await fn(this);
      await this.conn.commit();
      return out;
    } catch (err) {
      await this.conn.rollback();
      throw err;
    }
  }

  async close() {
    if (this.conn) {
      await this.conn.end();
      this.conn = null;
    }
  }
}
```

- [ ] **Step 4: Vérifier**

Run: `docker compose -f docker-compose.test.yml up -d mysql-test` (premier démarrage MySQL : ~30 s), puis
`$env:TEST_MYSQL_URL='mysql://netcodes:netcodes@localhost:3307/netcodes_test'; npx vitest run tests/adapter-contract.test.js`
Expected: PASS sqlite + mysql (et postgres si `TEST_PG_URL` aussi défini).

- [ ] **Step 5: Commit**

```bash
git add electron/db/mysql-adapter.js tests/adapter-contract.test.js package.json package-lock.json
git commit -m "feat(db): add MySqlAdapter"
```

---

### Task 5: `ConnectionManager`

**Files:**
- Create: `electron/db/connection-manager.js`
- Create: `tests/connection-manager.test.js`
- Delete: `electron/schema.sql` (si un doublon subsiste de la Task 2)

**Interfaces:**
- Consumes: les trois adaptateurs, `electron/db/schema/<type>.sql`.
- Produces: singleton `manager` :
  - `async open(config)` — `config = { id, name, type, file? | host?/port?/database?/user?/password? }` (mot de passe DÉJÀ déchiffré par l'appelant). Applique le schéma du dialecte après connexion. Statut `connecting` → `connected` | `error`.
  - `get(connId)` → adaptateur connecté, ou `throw new Error('Connexion indisponible : <id>')`.
  - `async close(connId)`, `async closeAll()`, `async openAll(configs)` (via `Promise.allSettled` — un échec n'affecte pas les autres).
  - `status(connId)` → `{ state: 'connected'|'connecting'|'error'|'closed', error: string|null }` ; `list()` → `[{ id, state, error }]`.
  - `onStatusChange` — callback `(connId, status)` assignable (main.js s'en sert pour pousser au renderer).

- [ ] **Step 1: Écrire les tests (échouent)**

`tests/connection-manager.test.js` :

```js
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { manager } from '../electron/db/connection-manager.js';

function tmpFile(name) {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'netcodes-cm-')), name);
}

afterEach(async () => {
  await manager.closeAll();
});

describe('ConnectionManager', () => {
  it('open applique le schéma et get retourne l\'adaptateur', async () => {
    await manager.open({ id: 'c1', name: 'Test', type: 'sqlite', file: ':memory:' });
    expect(manager.status('c1')).toEqual({ state: 'connected', error: null });
    const db = manager.get('c1');
    const rows = await db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='notebooks'");
    expect(rows.length).toBe(1);
  });

  it('deux connexions simultanées sont indépendantes', async () => {
    await manager.open({ id: 'c1', name: 'A', type: 'sqlite', file: ':memory:' });
    await manager.open({ id: 'c2', name: 'B', type: 'sqlite', file: ':memory:' });
    await manager.get('c1').insert('INSERT INTO notebooks (name, position) VALUES (?, ?)', ['only-in-c1', 1]);
    expect((await manager.get('c1').all('SELECT * FROM notebooks')).length).toBe(1);
    expect((await manager.get('c2').all('SELECT * FROM notebooks')).length).toBe(0);
  });

  it('get sur une connexion inconnue ou fermée jette', async () => {
    expect(() => manager.get('nope')).toThrow('Connexion indisponible');
    await manager.open({ id: 'c1', name: 'A', type: 'sqlite', file: ':memory:' });
    await manager.close('c1');
    expect(() => manager.get('c1')).toThrow('Connexion indisponible');
    expect(manager.status('c1').state).toBe('closed');
  });

  it('fichier sqlite corrompu → statut error, open rejette', async () => {
    const p = tmpFile('corrupt.sqlite');
    // En-tête SQLite valide suivi d'ordures : integrity_check/pragma échoue.
    const buf = Buffer.alloc(4096, 0xff);
    buf.write('SQLite format 3\u0000', 0, 'utf-8');
    fs.writeFileSync(p, buf);
    await expect(manager.open({ id: 'bad', name: 'Bad', type: 'sqlite', file: p }))
      .rejects.toThrow(/corrompue/);
    expect(manager.status('bad').state).toBe('error');
    expect(manager.status('bad').error).toMatch(/corrompue/);
  });

  it('openAll continue malgré un échec et notifie onStatusChange', async () => {
    const events = [];
    manager.onStatusChange = (id, status) => events.push([id, status.state]);
    const p = tmpFile('corrupt.sqlite');
    const buf = Buffer.alloc(4096, 0xff);
    buf.write('SQLite format 3\u0000', 0, 'utf-8');
    fs.writeFileSync(p, buf);
    await manager.openAll([
      { id: 'ok1', name: 'OK', type: 'sqlite', file: ':memory:' },
      { id: 'bad1', name: 'Bad', type: 'sqlite', file: p },
    ]);
    expect(manager.status('ok1').state).toBe('connected');
    expect(manager.status('bad1').state).toBe('error');
    expect(events).toContainEqual(['ok1', 'connected']);
    expect(events).toContainEqual(['bad1', 'error']);
    manager.onStatusChange = null;
  });

  it('type inconnu → erreur claire', async () => {
    await expect(manager.open({ id: 'x', name: 'X', type: 'oracle' }))
      .rejects.toThrow(/Type de connexion inconnu/);
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run tests/connection-manager.test.js`
Expected: FAIL — module absent.

- [ ] **Step 3: Implémenter**

`electron/db/connection-manager.js` :

```js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SqliteAdapter } from './sqlite-adapter.js';
import { MySqlAdapter } from './mysql-adapter.js';
import { PostgresAdapter } from './postgres-adapter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ADAPTERS = {
  sqlite: SqliteAdapter,
  mysql: MySqlAdapter,
  postgres: PostgresAdapter,
};

function loadSchema(type) {
  return fs.readFileSync(path.join(__dirname, 'schema', `${type}.sql`), 'utf-8');
}

class ConnectionManager {
  constructor() {
    this.connections = new Map(); // id -> { adapter, config }
    this.statuses = new Map();    // id -> { state, error }
    this.onStatusChange = null;   // (id, status) => void
  }

  setStatus(id, state, error = null) {
    const status = { state, error };
    this.statuses.set(id, status);
    if (this.onStatusChange) this.onStatusChange(id, status);
  }

  async open(config) {
    const Adapter = ADAPTERS[config.type];
    if (!Adapter) {
      this.setStatus(config.id, 'error', `Type de connexion inconnu : ${config.type}`);
      throw new Error(`Type de connexion inconnu : ${config.type}`);
    }
    // Ré-ouverture : fermer l'ancienne instance d'abord.
    if (this.connections.has(config.id)) {
      await this.close(config.id);
    }
    this.setStatus(config.id, 'connecting');
    const adapter = new Adapter(config);
    try {
      await adapter.open();
      await adapter.exec(loadSchema(config.type));
      this.connections.set(config.id, { adapter, config });
      this.setStatus(config.id, 'connected');
      return adapter;
    } catch (err) {
      await adapter.close().catch(() => {});
      this.setStatus(config.id, 'error', err.message);
      throw err;
    }
  }

  async openAll(configs) {
    await Promise.allSettled(configs.map(c => this.open(c)));
  }

  get(id) {
    const entry = this.connections.get(id);
    if (!entry || this.statuses.get(id)?.state !== 'connected') {
      throw new Error(`Connexion indisponible : ${id}`);
    }
    return entry.adapter;
  }

  status(id) {
    return this.statuses.get(id) ?? { state: 'closed', error: null };
  }

  list() {
    return [...this.statuses.entries()].map(([id, s]) => ({ id, ...s }));
  }

  async close(id) {
    const entry = this.connections.get(id);
    if (entry) {
      await entry.adapter.close().catch(() => {});
      this.connections.delete(id);
    }
    this.setStatus(id, 'closed');
  }

  async closeAll() {
    for (const id of [...this.connections.keys()]) {
      await this.close(id);
    }
    this.statuses.clear();
  }
}

export const manager = new ConnectionManager();
```

- [ ] **Step 4: Vérifier le vert**

Run: `npx vitest run tests/connection-manager.test.js`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add electron/db/connection-manager.js tests/connection-manager.test.js
git commit -m "feat(db): add ConnectionManager with per-connection status and openAll"
```

---

### Task 6: `settings.js` v2 — connexions + safeStorage + migration

**Files:**
- Modify: `electron/settings.js` (réécriture)
- Create: `tests/settings.test.js`

**Interfaces:**
- Consumes: `electron` (`app.getPath`, `safeStorage`) — mocké dans les tests.
- Produces:
  - `listConnections()` → configs SANS mot de passe : `[{ id, name, type, file?, host?, port?, database?, user? }]`
  - `getConnectionForOpen(id)` → config AVEC `password` déchiffré (usage main uniquement)
  - `addConnection(cfg)` → config enregistrée (chiffre `cfg.password` → `passwordEnc`, génère `id` 8 hex via `crypto.randomBytes(4)`)
  - `updateConnection(id, cfg)` (mot de passe absent/vide → conserve l'ancien `passwordEnc`)
  - `removeConnection(id)`
  - `migrateLegacyDbPath()` → si `settings.dbPath` existe et `connections` absent : crée `[{ id, name: 'Base locale', type: 'sqlite', file: <dbPath> }]`, supprime `dbPath`. Sans `dbPath` ni connexions : crée une connexion vers le chemin par défaut `userData/netcodes.sqlite`.

- [ ] **Step 1: Écrire les tests (échouent)**

`tests/settings.test.js` :

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'netcodes-settings-'));

vi.mock('electron', () => ({
  app: { getPath: () => tmpDir },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s) => Buffer.from(`enc:${s}`),
    decryptString: (b) => b.toString().replace(/^enc:/, ''),
  },
}));

const settings = await import('../electron/settings.js');
const settingsFile = path.join(tmpDir, 'settings.json');

beforeEach(() => {
  fs.rmSync(settingsFile, { force: true });
});

describe('settings v2', () => {
  it('addConnection chiffre le mot de passe et ne l\'expose jamais', () => {
    const saved = settings.addConnection({
      name: 'PG', type: 'postgres', host: 'h', port: 5432, database: 'db', user: 'u', password: 'secret',
    });
    expect(saved.id).toMatch(/^[0-9a-f]{8}$/);
    expect(saved.password).toBeUndefined();
    expect(saved.passwordEnc).toBeUndefined();
    const raw = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
    expect(raw.connections[0].passwordEnc).toBe(Buffer.from('enc:secret').toString('base64'));
    expect(JSON.stringify(raw)).not.toContain('secret');
    expect(settings.listConnections()[0].passwordEnc).toBeUndefined();
  });

  it('getConnectionForOpen déchiffre le mot de passe', () => {
    const { id } = settings.addConnection({
      name: 'PG', type: 'postgres', host: 'h', port: 5432, database: 'db', user: 'u', password: 'secret',
    });
    expect(settings.getConnectionForOpen(id).password).toBe('secret');
  });

  it('une connexion sqlite n\'a pas de mot de passe', () => {
    const { id } = settings.addConnection({ name: 'L', type: 'sqlite', file: 'D:/x.sqlite' });
    const cfg = settings.getConnectionForOpen(id);
    expect(cfg.file).toBe('D:/x.sqlite');
    expect(cfg.password).toBeUndefined();
  });

  it('updateConnection sans mot de passe conserve l\'ancien', () => {
    const { id } = settings.addConnection({
      name: 'PG', type: 'postgres', host: 'h', port: 5432, database: 'db', user: 'u', password: 'secret',
    });
    settings.updateConnection(id, { name: 'PG2', type: 'postgres', host: 'h2', port: 5432, database: 'db', user: 'u' });
    const cfg = settings.getConnectionForOpen(id);
    expect(cfg.name).toBe('PG2');
    expect(cfg.password).toBe('secret');
  });

  it('removeConnection supprime', () => {
    const { id } = settings.addConnection({ name: 'L', type: 'sqlite', file: 'D:/x.sqlite' });
    settings.removeConnection(id);
    expect(settings.listConnections()).toEqual([]);
  });

  it('migrateLegacyDbPath convertit dbPath en connexion sqlite', () => {
    fs.writeFileSync(settingsFile, JSON.stringify({ dbPath: 'D:/old/netcodes.sqlite' }));
    settings.migrateLegacyDbPath();
    const conns = settings.listConnections();
    expect(conns.length).toBe(1);
    expect(conns[0]).toMatchObject({ name: 'Base locale', type: 'sqlite', file: 'D:/old/netcodes.sqlite' });
    expect(JSON.parse(fs.readFileSync(settingsFile, 'utf-8')).dbPath).toBeUndefined();
    // Idempotent
    settings.migrateLegacyDbPath();
    expect(settings.listConnections().length).toBe(1);
  });

  it('migrateLegacyDbPath sans dbPath crée la connexion par défaut userData', () => {
    settings.migrateLegacyDbPath();
    const conns = settings.listConnections();
    expect(conns.length).toBe(1);
    expect(conns[0].file).toBe(path.join(tmpDir, 'netcodes.sqlite'));
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run tests/settings.test.js`
Expected: FAIL — `listConnections is not a function`.

- [ ] **Step 3: Réécrire `electron/settings.js`**

```js
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { app, safeStorage } from 'electron';

function getSettingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(getSettingsPath(), 'utf-8'));
  } catch {
    return {};
  }
}

function writeSettings(data) {
  fs.writeFileSync(getSettingsPath(), JSON.stringify(data, null, 2), 'utf-8');
}

function encryptPassword(password) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Chiffrement indisponible sur ce système : impossible d'enregistrer un mot de passe.");
  }
  return safeStorage.encryptString(password).toString('base64');
}

// Champs conservés tels quels dans settings.json (jamais `password` en clair).
function toStored(cfg, passwordEnc) {
  const stored = { id: cfg.id, name: cfg.name, type: cfg.type };
  if (cfg.type === 'sqlite') {
    stored.file = cfg.file;
  } else {
    stored.host = cfg.host;
    stored.port = cfg.port;
    stored.database = cfg.database;
    stored.user = cfg.user;
    if (passwordEnc) stored.passwordEnc = passwordEnc;
  }
  return stored;
}

// Vue publique : jamais passwordEnc.
function toPublic(stored) {
  const { passwordEnc, ...pub } = stored;
  return pub;
}

export function listConnections() {
  return (readSettings().connections ?? []).map(toPublic);
}

export function getConnectionForOpen(id) {
  const stored = (readSettings().connections ?? []).find(c => c.id === id);
  if (!stored) throw new Error(`Connexion inconnue : ${id}`);
  const cfg = toPublic(stored);
  if (stored.passwordEnc) {
    cfg.password = safeStorage.decryptString(Buffer.from(stored.passwordEnc, 'base64'));
  }
  return cfg;
}

export function addConnection(cfg) {
  const s = readSettings();
  const id = crypto.randomBytes(4).toString('hex');
  const passwordEnc = cfg.password ? encryptPassword(cfg.password) : undefined;
  const stored = toStored({ ...cfg, id }, passwordEnc);
  s.connections = [...(s.connections ?? []), stored];
  writeSettings(s);
  return toPublic(stored);
}

export function updateConnection(id, cfg) {
  const s = readSettings();
  const existing = (s.connections ?? []).find(c => c.id === id);
  if (!existing) throw new Error(`Connexion inconnue : ${id}`);
  const passwordEnc = cfg.password ? encryptPassword(cfg.password) : existing.passwordEnc;
  const stored = toStored({ ...cfg, id }, passwordEnc);
  s.connections = s.connections.map(c => (c.id === id ? stored : c));
  writeSettings(s);
  return toPublic(stored);
}

export function removeConnection(id) {
  const s = readSettings();
  s.connections = (s.connections ?? []).filter(c => c.id !== id);
  writeSettings(s);
}

// Au premier lancement 2.0.0 : convertit l'ancien réglage mono-base.
export function migrateLegacyDbPath() {
  const s = readSettings();
  if (s.connections && s.connections.length > 0) {
    if (s.dbPath) { delete s.dbPath; writeSettings(s); }
    return;
  }
  const file = s.dbPath || path.join(app.getPath('userData'), 'netcodes.sqlite');
  s.connections = [{
    id: crypto.randomBytes(4).toString('hex'),
    name: 'Base locale',
    type: 'sqlite',
    file,
  }];
  delete s.dbPath;
  writeSettings(s);
}
```

- [ ] **Step 4: Vérifier le vert**

Run: `npx vitest run tests/settings.test.js`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add electron/settings.js tests/settings.test.js
git commit -m "feat(settings): connection registry with safeStorage-encrypted passwords and legacy dbPath migration"
```

---

### Task 7: Ops `database.js` async + `connId` + SQL portable

**Files:**
- Modify: `electron/database.js` (réécriture complète)
- Modify: `tests/database.test.js` (réécriture : utilise les VRAIS ops au lieu du duplicata `makeOps`)
- Delete: `tests/init-database.test.js` (remplacé par `connection-manager.test.js`)
- Delete: `tests/helpers/db.js` (remplacé par `tests/helpers/conn.js`)
- Create: `tests/helpers/conn.js`

**Interfaces:**
- Consumes: `manager` (Task 5).
- Produces: `notebookOps`, `sectionOps`, `pageOps`, `blockOps`, `tagOps`, `searchOps` — mêmes fonctions qu'en 1.x mais `async` et avec `connId` en PREMIER argument. Exemples de signatures consommées par la Task 9 :
  - `notebookOps.getAll(connId)`, `notebookOps.create(connId, name, icon)` → id
  - `pageOps.toggleFavorite(connId, id)`
  - `searchOps.search(connId, query)` → `{ notebooks, sections, pages }`
- **`database.js` ne doit importer NI `electron`, NI `settings.js`** — uniquement `manager`. C'est ce qui rend les ops testables sous node sans mock.

- [ ] **Step 1: Helper de test + réécriture des tests**

`tests/helpers/conn.js` :

```js
import { manager } from '../../electron/db/connection-manager.js';

let counter = 0;

// Ouvre une connexion sqlite in-memory (schéma appliqué par le manager)
// et retourne son connId.
export async function openTestConnection() {
  const id = `test-${++counter}`;
  await manager.open({ id, name: 'Test', type: 'sqlite', file: ':memory:' });
  return id;
}

export async function closeAllTestConnections() {
  await manager.closeAll();
}
```

`tests/database.test.js` — réécrire l'en-tête ainsi (supprimer intégralement `makeOps` et l'import de `./helpers/db.js`) :

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openTestConnection, closeAllTestConnections } from './helpers/conn.js';
import {
  notebookOps, sectionOps, pageOps, blockOps, tagOps, searchOps,
} from '../electron/database.js';

let connId;

beforeEach(async () => {
  connId = await openTestConnection();
});

afterEach(async () => {
  await closeAllTestConnections();
});
```

Puis adapter chaque test existant par la transformation mécanique suivante (l'exemple vaut pour tous les blocs `describe`) :

```js
// AVANT (1.x, ops locaux sync)
const id = notebookOps.create('Notebook A', '📓');
const all = notebookOps.getAll();

// APRÈS (2.0, vrais ops async + connId)
const id = await notebookOps.create(connId, 'Notebook A', '📓');
const all = await notebookOps.getAll(connId);
```

Le seeding fait par `seedDb(db)` est remplacé par des appels aux vrais ops en début de test (`await notebookOps.create(connId, 'Notebook A')`, etc.). Ajouter deux tests neufs pour la portabilité :

```js
describe('portabilité SQL', () => {
  it('toggleFavorite bascule 0→1→0 sans NOT booléen', async () => {
    const nb = await notebookOps.create(connId, 'N', '📓');
    const sec = await sectionOps.create(connId, nb, 'S');
    const p = await pageOps.create(connId, sec, 'P');
    await pageOps.toggleFavorite(connId, p);
    expect((await pageOps.getById(connId, p)).favorite).toBe(1);
    await pageOps.toggleFavorite(connId, p);
    expect((await pageOps.getById(connId, p)).favorite).toBe(0);
  });

  it('la recherche est insensible à la casse via LOWER()', async () => {
    const nb = await notebookOps.create(connId, 'Docker Notes', '📓');
    const r = await searchOps.search(connId, 'dOcKeR');
    expect(r.notebooks.length).toBe(1);
  });

  it('addToPage est idempotent sans INSERT OR IGNORE', async () => {
    const nb = await notebookOps.create(connId, 'N', '📓');
    const sec = await sectionOps.create(connId, nb, 'S');
    const p = await pageOps.create(connId, sec, 'P');
    const t = await tagOps.create(connId, 'tag1');
    await tagOps.addToPage(connId, p, t);
    await tagOps.addToPage(connId, p, t);
    expect((await tagOps.getByPage(connId, p)).length).toBe(1);
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run tests/database.test.js`
Expected: FAIL — les ops actuels ne sont pas async / n'acceptent pas `connId`.

- [ ] **Step 3: Réécrire `electron/database.js`**

Modèle général (chaque op suit ce motif ; `db` = adaptateur résolu) :

```js
import { manager } from './db/connection-manager.js';

const db = (connId) => manager.get(connId);

// Notebook operations
export const notebookOps = {
  getAll: (connId) =>
    db(connId).all('SELECT * FROM notebooks ORDER BY position'),

  getById: (connId, id) =>
    db(connId).get('SELECT * FROM notebooks WHERE id = ?', [id]),

  create: async (connId, name, icon = '📓') => {
    const d = db(connId);
    const maxPos = await d.get('SELECT MAX(position) as max FROM notebooks');
    const position = (maxPos.max || 0) + 1;
    return d.insert('INSERT INTO notebooks (name, icon, position) VALUES (?, ?, ?)', [name, icon, position]);
  },

  update: (connId, id, name, icon) =>
    db(connId).run('UPDATE notebooks SET name = ?, icon = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [name, icon, id]),

  delete: (connId, id) =>
    db(connId).run('DELETE FROM notebooks WHERE id = ?', [id]),

  reorder: (connId, id, newPosition) =>
    db(connId).run('UPDATE notebooks SET position = ? WHERE id = ?', [newPosition, id]),
};
```

Appliquer le même motif à `sectionOps`, `pageOps`, `blockOps`, `tagOps` (toutes les requêtes SQL de 1.x sont conservées telles quelles, paramètres passés en tableau), avec TROIS exceptions de portabilité :

```js
// pageOps.toggleFavorite — `NOT favorite` n'existe pas en PG/MySQL sur un INT :
toggleFavorite: (connId, id) =>
  db(connId).run('UPDATE pages SET favorite = 1 - favorite, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]),

// tagOps.addToPage — `INSERT OR IGNORE` est du SQLite pur ; test-puis-insert portable :
addToPage: async (connId, pageId, tagId) => {
  const d = db(connId);
  const existing = await d.get('SELECT 1 AS one FROM page_tags WHERE page_id = ? AND tag_id = ?', [pageId, tagId]);
  if (!existing) {
    await d.run('INSERT INTO page_tags (page_id, tag_id) VALUES (?, ?)', [pageId, tagId]);
  }
},

// searchOps.search — LIKE est sensible à la casse en PG ; LOWER() partout :
export const searchOps = {
  search: async (connId, query) => {
    const d = db(connId);
    const term = `%${query.toLowerCase()}%`;

    const notebooks = await d.all(`
      SELECT id AS notebook_id, name AS notebook_name
      FROM notebooks
      WHERE LOWER(name) LIKE ?
      ORDER BY name
    `, [term]);

    const sections = await d.all(`
      SELECT s.id AS section_id, s.title AS section_title,
             n.id AS notebook_id, n.name AS notebook_name
      FROM sections s
      JOIN notebooks n ON s.notebook_id = n.id
      WHERE LOWER(s.title) LIKE ?
      ORDER BY s.title
    `, [term]);

    const pages = await d.all(`
      SELECT DISTINCT
        p.id        AS page_id,
        p.title     AS page_title,
        p.favorite  AS page_favorite,
        s.id        AS section_id,
        s.title     AS section_title,
        n.id        AS notebook_id,
        n.name      AS notebook_name,
        b.id        AS block_id,
        b.title     AS block_title,
        b.content   AS block_content,
        b.type      AS block_type,
        b.language  AS block_language
      FROM pages p
      JOIN sections s ON p.section_id = s.id
      JOIN notebooks n ON s.notebook_id = n.id
      LEFT JOIN blocks b ON b.page_id = p.id
      WHERE LOWER(p.title) LIKE ?
         OR LOWER(b.title) LIKE ?
         OR LOWER(b.content) LIKE ?
      ORDER BY p.updated_at DESC
    `, [term, term, term]);

    return { notebooks, sections, pages };
  },
};
```

Supprimer `initDatabase`, `getDatabase`, `closeDatabase` et l'import `electron` — plus aucun autre import que `manager`. Supprimer `electron/schema.sql` s'il reste un doublon de la Task 2, supprimer `tests/init-database.test.js` et `tests/helpers/db.js`.

- [ ] **Step 4: Vérifier le vert (toute la suite)**

Run: `npx vitest run`
Expected: PASS — adapter-contract, schema, connection-manager, settings, database. Zéro référence restante : `grep -rn "getDatabase\|initDatabase" electron/ src/` ne doit remonter que `electron/export.js` (traité Task 8).

- [ ] **Step 5: Commit**

```bash
git add electron/database.js tests/database.test.js tests/helpers/conn.js
git rm tests/init-database.test.js tests/helpers/db.js
git commit -m "feat(db): make all ops async and connection-scoped with portable SQL"
```

---

### Task 8: `export.js` async + `connId`

**Files:**
- Modify: `electron/export.js`

**Interfaces:**
- Consumes: `manager` (Task 5).
- Produces: `exportOps.exportPage(connId, pageId, format, blockLayout)`, `exportOps.exportSection(connId, sectionId, format, blockLayout)`, `exportOps.exportNotebook(connId, notebookId, format, blockLayout)`, `exportOps.exportBlock(connId, blockId, format)` — mêmes retours qu'en 1.x.

- [ ] **Step 1: Transformer**

Remplacer l'import et le résolveur :

```js
// AVANT
import { getDatabase } from './database.js';
// dans chaque fonction : const db = getDatabase();

// APRÈS
import { manager } from './db/connection-manager.js';
// dans chaque fonction exportée : const db = manager.get(connId);
```

Chaque fonction exportée gagne `connId` en premier paramètre. Chaque lecture sync devient await :

```js
// AVANT
const page = db.prepare('SELECT * FROM pages WHERE id = ?').get(pageId);
const blocks = db.prepare('SELECT * FROM blocks WHERE page_id = ? ORDER BY position').all(pageId);

// APRÈS
const page = await db.get('SELECT * FROM pages WHERE id = ?', [pageId]);
const blocks = await db.all('SELECT * FROM blocks WHERE page_id = ? ORDER BY position', [pageId]);
```

Appliquer mécaniquement à toutes les occurrences de `db.prepare(...)` du fichier (`grep -n "prepare" electron/export.js` pour les lister) ; les fonctions internes qui reçoivent déjà les données (`mdToParagraphs`, etc.) ne changent pas.

- [ ] **Step 2: Vérifier**

Run: `node --check electron/export.js` puis `grep -n "getDatabase\|prepare(" electron/export.js`
Expected: syntaxe OK, zéro occurrence.

- [ ] **Step 3: Commit**

```bash
git add electron/export.js
git commit -m "feat(export): scope exports to a connection id"
```

---

### Task 9: `main.js` + `preload.cjs` — IPC multi-connexions

**Files:**
- Modify: `electron/main.js`
- Modify: `electron/preload.cjs`

**Interfaces:**
- Consumes: `manager`, `settings` v2, ops async (Tasks 5-8).
- Produces (canaux IPC consommés par les Tasks 10-13) :
  - Tous les canaux métier 1.x avec `connId` en premier argument : `ipcRenderer.invoke('notebooks:getAll', connId)`, …, `invoke('search:query', connId, query)`, `invoke('export:page', connId, pageId, format, blockLayout)`.
  - `connections:list` → `[{ id, name, type, file?, host?, port?, database?, user?, status: { state, error } }]`
  - `connections:add(cfg)` / `connections:update(id, cfg)` → config publique ; ouvre/ré-ouvre la connexion dans la foulée
  - `connections:remove(id)` — ferme puis supprime
  - `connections:test(cfg)` → `{ ok: true }` ou `{ ok: false, error }` — connexion éphémère, jamais enregistrée ; pour un update sans nouveau mot de passe, `cfg.id` présent → reprend le mot de passe stocké
  - `connections:reconnect(id)` → `{ ok, error? }`
  - Event push `connections:status-changed` → payload `{ id, state, error }`
  - Event push `ui:open-connections` (déclenché par le menu)
  - Côté preload : `window.api.connections.{list,add,update,remove,test,reconnect}`, `window.api.onConnectionStatusChanged(cb)`, `window.api.onOpenConnectionsModal(cb)` (les deux `on*` retournent une fonction de désabonnement).

- [ ] **Step 1: Réécrire le démarrage et le menu dans `main.js`**

Remplacer les imports base de données et le bloc `app.whenReady()` :

```js
import {
  notebookOps, sectionOps, pageOps, blockOps, tagOps, searchOps,
} from './database.js';
import { manager } from './db/connection-manager.js';
import {
  listConnections, getConnectionForOpen, addConnection, updateConnection,
  removeConnection, migrateLegacyDbPath,
} from './settings.js';
import { exportOps } from './export.js';
```

```js
app.whenReady().then(async () => {
  migrateLegacyDbPath();

  manager.onStatusChange = (id, status) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('connections:status-changed', { id, ...status });
    }
  };

  setupApplicationMenu();
  createWindow();

  // Reconnexion automatique : toutes les connexions enregistrées, en parallèle.
  // Un échec laisse la connexion en statut error sans bloquer le démarrage.
  const configs = [];
  for (const c of listConnections()) {
    try {
      configs.push(getConnectionForOpen(c.id));
    } catch (err) {
      console.error(`Connexion ${c.id} illisible :`, err);
    }
  }
  manager.openAll(configs);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', async () => {
  await manager.closeAll();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
```

Supprimer intégralement `handleChooseDatabase()` et le dialog d'erreur DB du `whenReady`. Menu « Paramètres » remplacé par :

```js
{
  label: 'Paramètres',
  submenu: [
    {
      label: 'Connexions aux bases de données...',
      click: () => mainWindow?.webContents.send('ui:open-connections'),
    },
  ],
},
```

- [ ] **Step 2: Re-brancher les handlers métier avec `connId`**

Motif appliqué à TOUS les handlers existants (notebooks, sections, pages, blocks, tags, search, export) :

```js
// AVANT
ipcMain.handle('notebooks:getAll', () => notebookOps.getAll());
ipcMain.handle('notebooks:getById', (_, id) => notebookOps.getById(toId(id)));

// APRÈS
ipcMain.handle('notebooks:getAll', (_, connId) => notebookOps.getAll(connId));
ipcMain.handle('notebooks:getById', (_, connId, id) => notebookOps.getById(connId, toId(id)));
```

`search:query` et `export:*` suivent le même motif. Les validations `toId`/`toPosition` restent inchangées.

- [ ] **Step 3: Ajouter les handlers connexions**

```js
// IPC Handlers for Connections
ipcMain.handle('connections:list', () =>
  listConnections().map(c => ({ ...c, status: manager.status(c.id) }))
);

ipcMain.handle('connections:add', async (_, cfg) => {
  const saved = addConnection(cfg);
  manager.open(getConnectionForOpen(saved.id)).catch(() => {});
  return saved;
});

ipcMain.handle('connections:update', async (_, id, cfg) => {
  const saved = updateConnection(id, cfg);
  manager.open(getConnectionForOpen(id)).catch(() => {});
  return saved;
});

ipcMain.handle('connections:remove', async (_, id) => {
  await manager.close(id);
  removeConnection(id);
});

ipcMain.handle('connections:test', async (_, cfg) => {
  // Connexion éphémère : jamais enregistrée. Pour un update sans nouveau
  // mot de passe, cfg.id permet de reprendre le mot de passe stocké.
  const { SqliteAdapter } = await import('./db/sqlite-adapter.js');
  const { MySqlAdapter } = await import('./db/mysql-adapter.js');
  const { PostgresAdapter } = await import('./db/postgres-adapter.js');
  const ADAPTERS = { sqlite: SqliteAdapter, mysql: MySqlAdapter, postgres: PostgresAdapter };
  const Adapter = ADAPTERS[cfg.type];
  if (!Adapter) return { ok: false, error: `Type inconnu : ${cfg.type}` };
  let password = cfg.password;
  if (!password && cfg.id) {
    try { password = getConnectionForOpen(cfg.id).password; } catch { /* config neuve */ }
  }
  const adapter = new Adapter({ ...cfg, password });
  try {
    await adapter.open();
    await adapter.close();
    return { ok: true };
  } catch (err) {
    await adapter.close().catch(() => {});
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('connections:reconnect', async (_, id) => {
  try {
    await manager.open(getConnectionForOpen(id));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
```

- [ ] **Step 4: `preload.cjs`**

Chaque méthode existante gagne `connId` en tête, motif :

```js
notebooks: {
  getAll: (connId) => ipcRenderer.invoke('notebooks:getAll', connId),
  getById: (connId, id) => ipcRenderer.invoke('notebooks:getById', connId, id),
  create: (connId, name, icon) => ipcRenderer.invoke('notebooks:create', connId, name, icon),
  // ... idem update/delete/reorder, et pour sections/pages/blocks/tags/search/export
},
```

Ajouter :

```js
connections: {
  list: () => ipcRenderer.invoke('connections:list'),
  add: (cfg) => ipcRenderer.invoke('connections:add', cfg),
  update: (id, cfg) => ipcRenderer.invoke('connections:update', id, cfg),
  remove: (id) => ipcRenderer.invoke('connections:remove', id),
  test: (cfg) => ipcRenderer.invoke('connections:test', cfg),
  reconnect: (id) => ipcRenderer.invoke('connections:reconnect', id),
},

onConnectionStatusChanged: (cb) => {
  const listener = (_, payload) => cb(payload);
  ipcRenderer.on('connections:status-changed', listener);
  return () => ipcRenderer.removeListener('connections:status-changed', listener);
},

onOpenConnectionsModal: (cb) => {
  const listener = () => cb();
  ipcRenderer.on('ui:open-connections', listener);
  return () => ipcRenderer.removeListener('ui:open-connections', listener);
},
```

- [ ] **Step 5: Vérifier**

Run: `node --check electron/main.js` et `node --check electron/preload.cjs`
Expected: OK. Puis `grep -n "initDatabase\|closeDatabase\|getDbPath\|setDbPath\|getDefaultDbPath" electron/main.js` → zéro occurrence.

- [ ] **Step 6: Commit**

```bash
git add electron/main.js electron/preload.cjs
git commit -m "feat(ipc): connection-scoped channels, connections CRUD/test/reconnect, status push"
```

---

### Task 10: Renderer — App.jsx multi-connexions

**Files:**
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `window.api.*` (Task 9).
- Produces (props consommées par les Tasks 11-13) : entités taguées `connId`, état `connections` (`[{ id, name, type, status }]`), handlers inchangés de signature externe. Persistance sélection : `localStorage.lastActivePageKey = "<connId>:<pageId>"`.

**Principe directeur.** Les ids numériques ne sont uniques QUE par connexion. Règles appliquées partout dans le renderer :
1. Toute entité chargée est taguée : `{ ...row, connId }`.
2. Tout filtre parent/enfant apparie `connId` ET id : `p.connId === s.connId && p.section_id === s.id`.
3. Toute clé React devient `` `${item.connId}:${item.id}` ``.
4. Tout appel `window.api.*` prend le `connId` de l'entité concernée.

- [ ] **Step 1: État connexions + chargement multi-bases**

Ajouter l'état et remplacer `loadData` :

```js
const [connections, setConnections] = useState([]);
const [showConnections, setShowConnections] = useState(false);

const loadData = async () => {
  try {
    if (!window.api) throw new Error('Electron API not available');
    const conns = await window.api.connections.list();
    setConnections(conns);

    const connected = conns.filter(c => c.status.state === 'connected');
    const perConn = await Promise.all(connected.map(async (c) => {
      const [nbs, secs, pgs] = await Promise.all([
        window.api.notebooks.getAll(c.id),
        window.api.sections.getAll(c.id),
        window.api.pages.getAll(c.id),
      ]);
      const tag = (rows) => rows.map(r => ({ ...r, connId: c.id }));
      return { notebooks: tag(nbs), sections: tag(secs), pages: tag(pgs) };
    }));

    const notebooksData = perConn.flatMap(d => d.notebooks);
    const sectionsData = perConn.flatMap(d => d.sections);
    const pagesData = perConn.flatMap(d => d.pages);
    setNotebooks(notebooksData);
    setSections(sectionsData);
    setPages(pagesData);

    // Restauration de la dernière page active : clé "<connId>:<pageId>"
    const lastKey = localStorage.getItem('lastActivePageKey');
    const lastPage = lastKey
      ? pagesData.find(p => `${p.connId}:${p.id}` === lastKey)
      : null;
    const lastSection = lastPage
      ? sectionsData.find(s => s.connId === lastPage.connId && s.id === lastPage.section_id)
      : null;
    const lastNotebook = lastSection
      ? notebooksData.find(n => n.connId === lastSection.connId && n.id === lastSection.notebook_id)
      : null;

    if (lastPage && lastSection && lastNotebook) {
      setSelectedNotebook(lastNotebook);
      setSelectedSection(lastSection);
      setSelectedPage(lastPage);
      const blocksData = await window.api.blocks.getByPage(lastPage.connId, lastPage.id);
      setBlocks(blocksData.map(b => ({ ...b, connId: lastPage.connId })));
    } else if (notebooksData.length > 0) {
      const first = notebooksData[0];
      setSelectedNotebook(first);
      const firstSection = sectionsData.find(s => s.connId === first.connId && s.notebook_id === first.id);
      if (firstSection) {
        setSelectedSection(firstSection);
        const firstPage = pagesData.find(p => p.connId === firstSection.connId && p.section_id === firstSection.id);
        if (firstPage) {
          setSelectedPage(firstPage);
          const blocksData = await window.api.blocks.getByPage(firstPage.connId, firstPage.id);
          setBlocks(blocksData.map(b => ({ ...b, connId: firstPage.connId })));
        }
      }
    }
  } catch (error) {
    console.error('Error loading data:', error);
  } finally {
    setLoading(false);
  }
};
```

Persistance : remplacer l'effet `lastActivePageId` par :

```js
useEffect(() => {
  if (selectedPage) {
    localStorage.setItem('lastActivePageKey', `${selectedPage.connId}:${selectedPage.id}`);
  }
}, [selectedPage]);
```

Abonnements aux événements main :

```js
useEffect(() => {
  if (!window.api) return;
  const offStatus = window.api.onConnectionStatusChanged(() => { loadData(); });
  const offOpen = window.api.onOpenConnectionsModal(() => setShowConnections(true));
  return () => { offStatus(); offOpen(); };
}, []);
```

- [ ] **Step 2: Handlers — propagation `connId`**

Transformation mécanique de TOUS les handlers ; l'exemple ci-dessous fixe le motif exact à reproduire (le `connId` vient toujours de l'entité manipulée) :

```js
// AVANT
const handleSectionSelect = async (section, handleChildSelectection = false) => {
  setSelectedSection(section);
  const notebook = await window.api.notebooks.getById(section.notebook_id);
  setSelectedNotebook(notebook);
  const sectionPages = pages.filter(p => p.section_id === section.id);
  ...
};

// APRÈS
const handleSectionSelect = async (section, handleChildSelectection = false) => {
  setSelectedSection(section);
  const notebook = await window.api.notebooks.getById(section.connId, section.notebook_id);
  setSelectedNotebook({ ...notebook, connId: section.connId });
  const sectionPages = pages.filter(p => p.connId === section.connId && p.section_id === section.id);
  ...
};
```

Points particuliers :
- Toute entité relue via `getById` est re-taguée : `{ ...row, connId }`.
- `handleCreateNotebook` : cible la connexion de la sélection courante, sinon la première connectée ; alerte si aucune :

```js
const targetConnId = selectedNotebook?.connId
  ?? connections.find(c => c.status.state === 'connected')?.id;
if (!targetConnId) { alert('Aucune base connectée.'); return; }
const idNoteBook = await window.api.notebooks.create(targetConnId, name, '📓');
```

  `handleCreateNotebook` accepte aussi un `connId` optionnel en premier argument (`handleCreateNotebook(connId)`) — utilisé par le bouton « + » des groupes de la sidebar (Task 11) : s'il est fourni, il prime sur la sélection.
- `handleReorderNotebook(notebookId, ...)` → `handleReorderNotebook(connId, notebookId, ...)` et le tri se fait sur `notebooks.filter(n => n.connId === connId)` (idem sections/pages/blocks pour les reorders).
- `handleToggleFavorite(page)` reçoit désormais l'objet page (pas l'id) pour porter `connId` ; recharge via `loadData()`.
- `blocks` : toujours tagués `connId` au chargement ; `handleUpdateBlock`/`handleDeleteBlock`/`handleReorderBlock` utilisent `selectedPage.connId`.
- Filtre du panneau pages : `pages.filter(p => selectedSection ? (p.connId === selectedSection.connId && p.section_id === selectedSection.id) : false)`.
- MoveModal (le composant ne change pas) : les listes passées sont préfiltrées par connexion —

```js
notebooks={notebooks.filter(n => n.connId === moveModal.item.connId)}
sections={sections.filter(s => s.connId === moveModal.item.connId &&
  (moveModal.mode === 'page' ? s.id !== moveModal.item.section_id : s.notebook_id !== moveModal.item.id))}
```

- ExportModal : passer `connId={exportModal.item.connId}` (consommé Task 13).
- SearchModal : passer `connections={connections}` et `defaultConnId={selectedPage?.connId ?? selectedNotebook?.connId ?? connections.find(c => c.status.state === 'connected')?.id}` (consommé Task 13).
- Rendu : monter `<ConnectionsModal>` (Task 12) quand `showConnections` est vrai ; passer `connections={connections}` et `onNotebookCreateInConnection={handleCreateNotebook}` à `<Sidebar>` (Task 11).

- [ ] **Step 3: Vérifier**

Run: `npm run build`
Expected: build Vite OK (les composants enfants ne sont pas encore adaptés — seulement si le build casse sur un import manquant de `ConnectionsModal`, créer un placeholder `src/components/ConnectionsModal.jsx` exportant `() => null`, remplacé Task 12).

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx src/components/ConnectionsModal.jsx
git commit -m "feat(app): multi-connection state, connId-tagged entities and handlers"
```

---

### Task 11: Sidebar — groupes par connexion

**Files:**
- Modify: `src/components/Sidebar.jsx`

**Interfaces:**
- Consumes: props `connections` (`[{ id, name, type, status }]`), `onNotebookCreateInConnection(connId)`, entités taguées `connId` (Task 10) ; `window.api.connections.reconnect(id)`.
- Produces: sidebar groupée par connexion.

- [ ] **Step 1: Groupes de connexions dans le rendu**

Nouveau composant interne dans le même fichier (au-dessus de `Sidebar`) :

```js
const CONN_ICONS = { sqlite: 'bi-file-earmark-binary', mysql: 'bi-database', postgres: 'bi-database-fill' };
const CONN_STATE_COLORS = { connected: '#28a745', connecting: '#ffc107', error: '#dc3545', closed: '#6c757d' };

function ConnectionGroup({ conn, isCollapsed, onToggle, onCreateNotebook, onReconnect, children }) {
  const state = conn.status?.state ?? 'closed';
  return (
    <div className="connection-group mb-2">
      <div
        className="d-flex align-items-center gap-2 px-2 py-1 fw-semibold"
        style={{ cursor: 'pointer', fontSize: '0.85rem', opacity: state === 'connected' ? 1 : 0.6 }}
        onClick={onToggle}
        title={state === 'error' ? conn.status.error : conn.name}
      >
        <i className={`bi ${isCollapsed ? 'bi-chevron-right' : 'bi-chevron-down'}`} style={{ fontSize: '0.7rem' }}></i>
        <i className={`bi ${CONN_ICONS[conn.type] ?? 'bi-database'}`}></i>
        <span className="flex-grow-1 text-truncate">{conn.name}</span>
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          backgroundColor: CONN_STATE_COLORS[state] ?? '#6c757d',
        }}></span>
        {state === 'connected' && (
          <button
            className="btn btn-sm btn-link p-0"
            title="Nouveau notebook dans cette base"
            onClick={(e) => { e.stopPropagation(); onCreateNotebook(conn.id); }}
          >
            <i className="bi bi-plus-circle"></i>
          </button>
        )}
        {state === 'error' && (
          <button
            className="btn btn-sm btn-link p-0 text-danger"
            title={`Reconnecter — ${conn.status.error}`}
            onClick={(e) => { e.stopPropagation(); onReconnect(conn.id); }}
          >
            <i className="bi bi-arrow-clockwise"></i>
          </button>
        )}
      </div>
      {!isCollapsed && state === 'connected' && <div className="ps-2">{children}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Boucle principale**

`Sidebar` reçoit les nouvelles props `connections` et `onNotebookCreateInConnection`. État de repli par connexion :

```js
const [collapsedConns, setCollapsedConns] = useState(() => {
  try { return JSON.parse(localStorage.getItem('collapsedConnections')) ?? []; }
  catch { return []; }
});
useEffect(() => {
  localStorage.setItem('collapsedConnections', JSON.stringify(collapsedConns));
}, [collapsedConns]);
```

Dans `sidebar-body`, remplacer `notebooks.map(...)` par :

```js
connections.map(conn => {
  const connNotebooks = notebooks.filter(n => n.connId === conn.id);
  return (
    <ConnectionGroup
      key={conn.id}
      conn={conn}
      isCollapsed={collapsedConns.includes(conn.id)}
      onToggle={() => setCollapsedConns(prev =>
        prev.includes(conn.id) ? prev.filter(id => id !== conn.id) : [...prev, conn.id])}
      onCreateNotebook={onNotebookCreateInConnection}
      onReconnect={(id) => window.api.connections.reconnect(id)}
    >
      {connNotebooks.map((notebook, index) => (
        /* rendu DraggableNotebookItem existant, avec index/notebookCount
           calculés sur connNotebooks (le drag-reorder reste intra-connexion) */
      ))}
    </ConnectionGroup>
  );
})
```

Adaptations mécaniques dans le corps de `Sidebar` :
- `expandedNotebooks` et `knownNotebookIdsRef` : clés `` `${n.connId}:${n.id}` `` au lieu de `n.id` (toggle, auto-expand, persistance localStorage inclus).
- `moveNotebook` : résout le notebook dans `connNotebooks` de la connexion concernée.
- Les sections d'un notebook : `sections.filter(s => s.connId === notebook.connId && s.notebook_id === notebook.id)`.
- Toute clé React de notebook/section : `` `${item.connId}:${item.id}` ``.

- [ ] **Step 3: Vérifier**

Run: `npm run build`
Expected: OK.

- [ ] **Step 4: Commit**

```bash
git add src/components/Sidebar.jsx
git commit -m "feat(sidebar): group notebooks under connection headers with status and reconnect"
```

---

### Task 12: `ConnectionsModal`

**Files:**
- Create (ou remplacer le placeholder): `src/components/ConnectionsModal.jsx`

**Interfaces:**
- Consumes: `window.api.connections.*` (Task 9).
- Produces: `<ConnectionsModal connections={connections} onClose={fn} onChanged={loadData} />`.

- [ ] **Step 1: Implémenter**

```js
import React, { useState } from 'react';

const EMPTY_FORM = { name: '', type: 'sqlite', file: '', host: '', port: '', database: '', user: '', password: '' };
const DEFAULT_PORTS = { mysql: 3306, postgres: 5432 };
const STATE_LABELS = { connected: 'Connectée', connecting: 'Connexion…', error: 'Erreur', closed: 'Fermée' };
const STATE_COLORS = { connected: 'success', connecting: 'warning', error: 'danger', closed: 'secondary' };

function ConnectionsModal({ connections, onClose, onChanged }) {
  const [editing, setEditing] = useState(null); // null | 'new' | connId
  const [form, setForm] = useState(EMPTY_FORM);
  const [testResult, setTestResult] = useState(null);
  const [saving, setSaving] = useState(false);

  const startEdit = (conn) => {
    setTestResult(null);
    if (conn) {
      setEditing(conn.id);
      setForm({ ...EMPTY_FORM, ...conn, port: conn.port ?? '', password: '' });
    } else {
      setEditing('new');
      setForm(EMPTY_FORM);
    }
  };

  const buildCfg = () => {
    const cfg = { name: form.name.trim(), type: form.type };
    if (form.type === 'sqlite') {
      cfg.file = form.file.trim();
    } else {
      cfg.host = form.host.trim();
      cfg.port = Number(form.port) || DEFAULT_PORTS[form.type];
      cfg.database = form.database.trim();
      cfg.user = form.user.trim();
      if (form.password) cfg.password = form.password;
    }
    return cfg;
  };

  const isValid = () => {
    if (!form.name.trim()) return false;
    if (form.type === 'sqlite') return Boolean(form.file.trim());
    return Boolean(form.host.trim() && form.database.trim() && form.user.trim());
  };

  const handleTest = async () => {
    setTestResult({ pending: true });
    const cfg = buildCfg();
    if (editing !== 'new') cfg.id = editing; // reprendre le mdp stocké si champ vide
    const r = await window.api.connections.test(cfg);
    setTestResult(r);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editing === 'new') await window.api.connections.add(buildCfg());
      else await window.api.connections.update(editing, buildCfg());
      setEditing(null);
      await onChanged();
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (conn) => {
    if (window.confirm(`Retirer la connexion « ${conn.name} » ?\nLes données de la base ne seront pas supprimées.`)) {
      await window.api.connections.remove(conn.id);
      await onChanged();
    }
  };

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  return (
    <div className="search-modal-backdrop" onClick={onClose}>
      <div className="search-modal" style={{ width: 640 }} onClick={(e) => e.stopPropagation()}>
        <div className="p-3 border-bottom d-flex align-items-center">
          <h6 className="mb-0 flex-grow-1"><i className="bi bi-database me-2"></i>Connexions aux bases de données</h6>
          <button className="btn btn-sm btn-primary" onClick={() => startEdit(null)}>
            <i className="bi bi-plus-circle me-1"></i>Ajouter
          </button>
        </div>

        <div className="p-3" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          {editing === null ? (
            connections.length === 0 ? (
              <p className="text-muted small mb-0">Aucune connexion. Cliquez sur « Ajouter ».</p>
            ) : (
              connections.map(conn => {
                const state = conn.status?.state ?? 'closed';
                return (
                  <div key={conn.id} className="d-flex align-items-center gap-2 py-2 border-bottom">
                    <span className={`badge bg-${STATE_COLORS[state]}`}>{STATE_LABELS[state]}</span>
                    <div className="flex-grow-1">
                      <div className="fw-semibold">{conn.name} <span className="text-muted small">({conn.type})</span></div>
                      <div className="text-muted small text-truncate">
                        {conn.type === 'sqlite' ? conn.file : `${conn.user}@${conn.host}:${conn.port}/${conn.database}`}
                      </div>
                      {state === 'error' && <div className="text-danger small">{conn.status.error}</div>}
                    </div>
                    {state === 'error' && (
                      <button className="btn btn-sm btn-outline-warning" title="Reconnecter"
                        onClick={() => window.api.connections.reconnect(conn.id).then(onChanged)}>
                        <i className="bi bi-arrow-clockwise"></i>
                      </button>
                    )}
                    <button className="btn btn-sm btn-outline-secondary" title="Modifier" onClick={() => startEdit(conn)}>
                      <i className="bi bi-pencil"></i>
                    </button>
                    <button className="btn btn-sm btn-outline-danger" title="Retirer" onClick={() => handleRemove(conn)}>
                      <i className="bi bi-trash"></i>
                    </button>
                  </div>
                );
              })
            )
          ) : (
            <div>
              <div className="mb-2">
                <label className="form-label small mb-1">Nom</label>
                <input className="form-control form-control-sm" value={form.name} onChange={set('name')} placeholder="Perso, Travail…" />
              </div>
              <div className="mb-2">
                <label className="form-label small mb-1">Type</label>
                <select className="form-select form-select-sm" value={form.type} onChange={set('type')} disabled={editing !== 'new'}>
                  <option value="sqlite">SQLite (fichier)</option>
                  <option value="mysql">MySQL</option>
                  <option value="postgres">PostgreSQL</option>
                </select>
              </div>
              {form.type === 'sqlite' ? (
                <div className="mb-2">
                  <label className="form-label small mb-1">Fichier</label>
                  {/* Le chemin se choisit par le sélecteur natif de l'OS, jamais
                      par saisie libre, et ne s'affiche qu'une fois le fichier
                      choisi. Voir la section « Modal Connexions » de la spec. */}
                  <input className="form-control form-control-sm" value={form.file} readOnly
                    placeholder="Aucun fichier sélectionné" />
                </div>
              ) : (
                <>
                  <div className="row g-2 mb-2">
                    <div className="col-8">
                      <label className="form-label small mb-1">Hôte</label>
                      <input className="form-control form-control-sm" value={form.host} onChange={set('host')} />
                    </div>
                    <div className="col-4">
                      <label className="form-label small mb-1">Port</label>
                      <input className="form-control form-control-sm" type="number" value={form.port}
                        onChange={set('port')} placeholder={String(DEFAULT_PORTS[form.type])} />
                    </div>
                  </div>
                  <div className="mb-2">
                    <label className="form-label small mb-1">Base de données</label>
                    <input className="form-control form-control-sm" value={form.database} onChange={set('database')} />
                  </div>
                  <div className="row g-2 mb-2">
                    <div className="col-6">
                      <label className="form-label small mb-1">Utilisateur</label>
                      <input className="form-control form-control-sm" value={form.user} onChange={set('user')} />
                    </div>
                    <div className="col-6">
                      <label className="form-label small mb-1">Mot de passe</label>
                      <input className="form-control form-control-sm" type="password" value={form.password}
                        onChange={set('password')}
                        placeholder={editing !== 'new' ? '(inchangé si vide)' : ''} />
                    </div>
                  </div>
                </>
              )}

              {testResult && !testResult.pending && (
                <div className={`alert alert-${testResult.ok ? 'success' : 'danger'} py-1 px-2 small mb-2`}>
                  {testResult.ok ? 'Connexion réussie.' : testResult.error}
                </div>
              )}

              <div className="d-flex gap-2 mt-3">
                <button className="btn btn-sm btn-outline-secondary" onClick={handleTest}
                  disabled={!isValid() || testResult?.pending}>
                  {testResult?.pending
                    ? <span className="spinner-border spinner-border-sm"></span>
                    : <><i className="bi bi-plug me-1"></i>Tester</>}
                </button>
                <div className="flex-grow-1"></div>
                <button className="btn btn-sm btn-secondary" onClick={() => setEditing(null)}>Annuler</button>
                <button className="btn btn-sm btn-primary" onClick={handleSave} disabled={!isValid() || saving}>
                  Enregistrer
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ConnectionsModal;
```

- [ ] **Step 2: Vérifier**

Run: `npm run build`
Expected: OK.

- [ ] **Step 3: Commit**

```bash
git add src/components/ConnectionsModal.jsx
git commit -m "feat(connections): add connections management modal with live test"
```

---

### Task 13: SearchModal + ExportModal — `connId`

**Files:**
- Modify: `src/components/SearchModal.jsx`
- Modify: `src/components/ExportModal.jsx`

**Interfaces:**
- Consumes: props `connections`, `defaultConnId` (SearchModal) et `connId` (ExportModal) fournies par App.jsx (Task 10).

- [ ] **Step 1: SearchModal — sélecteur de connexion**

Nouvelles props : `function SearchModal({ connections, defaultConnId, onClose, ... })`. État et recherche :

```js
const [connId, setConnId] = useState(defaultConnId);
const connected = connections.filter(c => c.status.state === 'connected');
```

`handleSearch` : `await window.api.search.query(connId, value)` ; en tête des résultats, taguer `connId` sur chaque entité retournée pour que les handlers d'App naviguent dans la bonne base :

```js
setAllResults({
  notebooks: notebooks.map(n => ({ id: n.notebook_id, name: n.notebook_name, connId })),
  sections: sections.map(s => ({ id: s.section_id, title: s.section_title, notebook_id: s.notebook_id, notebook_name: s.notebook_name, connId })),
  pages: Object.values(pagesMap).map(p => ({ ...p, connId })),
});
```

Dans la barre de filtres, avant le bouton Favoris :

```js
<select
  className="form-select form-select-sm"
  style={{ width: 'auto' }}
  value={connId ?? ''}
  onChange={(e) => { setConnId(e.target.value); if (query) handleSearch(query); }}
  title="Base de données"
>
  {connected.map(c => (
    <option key={c.id} value={c.id}>{c.name}</option>
  ))}
</select>
```

Changement de connexion → relance `handleSearch(query)` (le `connId` de l'état est lu dans `handleSearch` ; passer `connId` en argument pour éviter la valeur périmée : `handleSearch(value, nextConnId)` avec défaut `connId`).

- [ ] **Step 2: ExportModal — propagation**

Nouvelle prop `connId`. Les quatre appels deviennent :

```js
if (mode === 'page') result = await window.api.export.page(connId, item.id, format, blockLayout);
else if (mode === 'section') result = await window.api.export.section(connId, item.id, format, blockLayout);
else if (mode === 'block') result = await window.api.export.block(connId, item.id, format);
else result = await window.api.export.notebook(connId, item.id, format, blockLayout);
```

- [ ] **Step 3: Vérifier**

Run: `npm run build`
Expected: OK.

- [ ] **Step 4: Commit**

```bash
git add src/components/SearchModal.jsx src/components/ExportModal.jsx
git commit -m "feat(search,export): scope search and exports to a selected connection"
```

---

### Task 14: Version 2.0.0 + vérification de bout en bout

**Files:**
- Modify: `package.json` (`"version": "2.0.0"`)

- [ ] **Step 1: Bump version**

`package.json` : `"version": "2.0.0"`.

- [ ] **Step 2: Suite de tests complète**

Run: `npx vitest run`
Expected: PASS intégral (sqlite). Optionnel : relancer avec `TEST_PG_URL`/`TEST_MYSQL_URL` + docker compose pour les contract tests serveur.

- [ ] **Step 3: Vérification manuelle dans l'app**

Run: `npm run rebuild:electron`, puis `npm run dev` (terminal 1) et `npx electron .` (terminal 2).

Checklist manuelle (critères de succès de la spec) :
1. Premier lancement : la base 1.x apparaît comme « Base locale », données intactes.
2. Menu Paramètres → Connexions : ajouter une connexion PostgreSQL (docker compose de test au besoin) — Tester → Enregistrer → le groupe apparaît, pastille verte.
3. Créer notebook/section/page/blocs dans chaque base ; vérifier l'étanchéité (rien ne fuit d'un groupe à l'autre).
4. Recherche Ctrl+K : le sélecteur bascule bien la base interrogée.
5. Couper le serveur PG (`docker compose -f docker-compose.test.yml stop pg-test`) : pastille rouge, app utilisable ; relancer le serveur, « Reconnecter » → vert, données de retour.
6. Redémarrer l'app : les deux connexions se rouvrent automatiquement.
7. Export d'une page de chaque base.
8. `settings.json` : vérifier qu'aucun mot de passe en clair n'y figure.

- [ ] **Step 4: Commit final**

```bash
git add package.json
git commit -m "chore: bump version to 2.0.0"
```

---

## Self-Review (effectuée)

- **Couverture spec** : simultanéité (T5, T10, T11), recherche mono-base (T13), safeStorage (T6), reconnexion auto au démarrage (T9 Step 1), migration 1.x (T6), statuts/resilience (T5, T9, T11, T12), pas de transfert inter-bases (MoveModal préfiltré T10), tests contract + docker (T1-T4), critères de succès (T14). ✓
- **Types cohérents** : `manager.open/get/close/status/list`, signatures ops `(connId, ...)`, canaux IPC et preload alignés T9↔T10-13, `status: { state, error }` partout. ✓
- **Placeholders** : les transformations « mécaniques » (T7 Step 3, T8, T9 Step 2, T10 Step 2) donnent chacune le motif exact avant/après à reproduire — pas de « TBD ». ✓
