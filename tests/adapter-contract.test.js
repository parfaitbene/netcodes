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
