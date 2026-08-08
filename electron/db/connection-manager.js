import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SqliteAdapter } from './sqlite-adapter.js';
import { MySqlAdapter } from './mysql-adapter.js';
import { PostgresAdapter } from './postgres-adapter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ADAPTERS = {
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
    // Ré-ouverture : fermer l'ancienne instance d'abord.
    if (this.connections.has(config.id)) {
      await this.close(config.id);
    }
    const Adapter = ADAPTERS[config.type];
    if (!Adapter) {
      this.setStatus(config.id, 'error', `Type de connexion inconnu : ${config.type}`);
      throw new Error(`Type de connexion inconnu : ${config.type}`);
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
