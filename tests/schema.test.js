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

  // Finding 4 : sans `PRAGMA foreign_keys = ON`, les `ON DELETE CASCADE` du
  // schéma sont décoratifs sur SQLite (désactivés par connexion, par défaut).
  it('open() active PRAGMA foreign_keys sur la connexion', async () => {
    const a = new SqliteAdapter({ file: ':memory:' });
    await a.open();
    expect(a.db.pragma('foreign_keys', { simple: true })).toBe(1);
    await a.close();
  });
});
