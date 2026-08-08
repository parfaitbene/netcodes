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
