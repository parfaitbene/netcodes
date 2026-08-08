import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { manager } from '../electron/db/connection-manager.js';
import { notebookOps, sectionOps, pageOps, blockOps, searchOps } from '../electron/database.js';

// Régression : `searchOps.search` (pages) fait un SELECT DISTINCT avec
// ORDER BY p.updated_at, mais p.updated_at n'était pas dans la liste SELECT.
// SQLite tolère ça, MySQL et PostgreSQL le rejettent (ER_FIELD_IN_ORDER_NOT_SELECT
// / "ORDER BY expressions must appear in select list"). Ce test exécute la
// vraie requête sur les trois dialectes pour attraper la classe de bug que
// database.test.js (SQLite uniquement) ne peut pas voir.

// Préfixe distinctif : sert à retrouver ET nettoyer les lignes créées par ce
// test, car les bases MySQL/PostgreSQL de test sont partagées entre les
// exécutions (contrairement au SQLite in-memory, toujours vierge).
const MARKER = 'XDialectSearchMarker';
const NEEDLE = `${MARKER.toLowerCase()}needle`;

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

const PG_URL = process.env.TEST_PG_URL;
const MYSQL_URL = process.env.TEST_MYSQL_URL;

// Supprime toutes les lignes créées par ce test. On supprime le notebook par
// préfixe de nom : les FK `ON DELETE CASCADE` (sections -> notebooks,
// pages -> sections, blocks -> pages ; voir electron/db/schema/*.sql)
// propagent la suppression jusqu'aux blocks sur MySQL/PostgreSQL. Inutile
// pour SQLite (connexion in-memory neuve à chaque test) mais inoffensif.
async function cleanup(connId) {
  const d = manager.get(connId);
  await d.run('DELETE FROM notebooks WHERE name LIKE ?', [`${MARKER}%`]);
}

function searchCrossDialect(name, { enabled = true, open, connId }) {
  const d = enabled ? describe : describe.skip;
  d(`searchOps.search cross-dialect : ${name}`, () => {
    beforeEach(async () => {
      await open();
      await cleanup(connId);
    });

    afterEach(async () => {
      await cleanup(connId);
      await manager.close(connId);
    });

    it('trouve la page malgré la casse mixte (régression DISTINCT/ORDER BY)', async () => {
      const nb = await notebookOps.create(connId, `${MARKER}-notebook`, '📓');
      const sec = await sectionOps.create(connId, nb, `${MARKER}-section`);
      const p = await pageOps.create(connId, sec, `${MARKER}-page`);
      await blockOps.create(
        connId,
        p,
        'text',
        `Ce bloc contient le terme ${NEEDLE} à retrouver.`,
        null,
        null,
        null,
      );

      // Requête en casse mixte : prouve à la fois que la requête s'exécute
      // sur ce moteur (la régression que ce test garde) et que LOWER() rend
      // bien la recherche insensible à la casse.
      const mixedCaseQuery = NEEDLE.replace(/[a-z]/g, (c, i) => (i % 2 === 0 ? c.toUpperCase() : c));
      const result = await searchOps.search(connId, mixedCaseQuery);

      expect(result.pages.some((r) => r.page_id === p)).toBe(true);
    });
  });
}

searchCrossDialect('sqlite', {
  connId: 'xdialect-sqlite',
  open: () => manager.open({ id: 'xdialect-sqlite', name: 'XDialect SQLite', type: 'sqlite', file: ':memory:' }),
});

searchCrossDialect('postgres', {
  enabled: Boolean(PG_URL),
  connId: 'xdialect-postgres',
  open: () => manager.open({ id: 'xdialect-postgres', name: 'XDialect PG', type: 'postgres', ...(PG_URL ? pgConfigFromUrl(PG_URL) : {}) }),
});

searchCrossDialect('mysql', {
  enabled: Boolean(MYSQL_URL),
  connId: 'xdialect-mysql',
  open: () => manager.open({ id: 'xdialect-mysql', name: 'XDialect MySQL', type: 'mysql', ...(MYSQL_URL ? mysqlConfigFromUrl(MYSQL_URL) : {}) }),
});
