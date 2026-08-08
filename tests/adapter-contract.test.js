import { adapterContract } from './helpers/adapter-contract.js';
import { SqliteAdapter } from '../electron/db/sqlite-adapter.js';
import { PostgresAdapter } from '../electron/db/postgres-adapter.js';

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

import { describe, it, expect, vi } from 'vitest';

describe.skipIf(!PG_URL)('PostgresAdapter.open failure handling', () => {
  it('libère le client quand la connexion échoue', async () => {
    const bad = new PostgresAdapter({ ...pgConfigFromUrl(PG_URL), password: 'mauvais-mot-de-passe' });
    await expect(bad.open()).rejects.toThrow();
    expect(bad.client).toBeNull();
    // close() sur un adaptateur jamais ouvert ne doit pas jeter
    await expect(bad.close()).resolves.toBeUndefined();
  });
});

describe('PostgresAdapter connection loss', () => {
  it("capture l'événement 'error' du client au lieu de laisser Node le relancer", async () => {
    const adapter = new PostgresAdapter({ host: 'h', port: 5432, database: 'd', user: 'u', password: 'p' });
    // Neutralise la connexion réseau : on veut seulement le comportement du listener.
    const pg = (await import('pg')).default;
    const connectSpy = vi.spyOn(pg.Client.prototype, 'connect').mockResolvedValue(undefined);
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await adapter.open();
      expect(adapter.lastError).toBeNull();
      // Perte de connexion côté serveur pendant l'inactivité.
      adapter.client.emit('error', new Error('connection terminated unexpectedly'));
      expect(adapter.lastError?.message).toBe('connection terminated unexpectedly');
    } finally {
      connectSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    }
  });
});
