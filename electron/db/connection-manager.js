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

// Un hôte dual-stack (ex. `localhost` → `::1` + `127.0.0.1`) dont les deux
// adresses refusent la connexion fait lever à Node un `AggregateError` dont
// `.message` est une chaîne vide : sans cette normalisation, le statut affiché
// à l'utilisateur (point rouge + tooltip) ne dit rien du tout. Exportée pour
// être réutilisée partout où une erreur de connexion devient un message
// affiché (IPC `connections:test`, `connections:reconnect`).
export function normalizeConnectionError(err) {
  if (!err) return 'Connexion impossible (échec sans détail).';

  // AggregateError (ou toute erreur portant un tableau `errors`, ex. Node
  // dual-stack ECONNREFUSED sur ::1 + 127.0.0.1) : on regroupe les messages
  // distincts des erreurs enfants.
  if (Array.isArray(err.errors) && err.errors.length > 0) {
    const childMessages = err.errors.map((e) => (e && e.message) || (e && e.code)).filter(Boolean);
    const distinct = [...new Set(childMessages)];
    if (distinct.length > 0) return distinct.join(' ; ');
  }

  if (err.message) return err.message;
  if (err.code) return err.code;

  return 'Connexion impossible (échec sans détail).';
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
      // Un serveur qui meurt en cours de session (redémarrage MySQL/PG)
      // n'appelle jamais open()/close() : sans ce hook, le statut resterait
      // bloqué à 'connected' indéfiniment (finding 2 de la revue). Le
      // contrôle d'identité (`current.adapter !== adapter`) protège contre
      // une erreur tardive d'un adaptateur déjà remplacé/fermé (reconnexion
      // entre-temps) qui ressusciterait un statut périmé.
      adapter.onFatalError = (err) => {
        const current = this.connections.get(config.id);
        if (!current || current.adapter !== adapter) return;
        this.setStatus(config.id, 'error', normalizeConnectionError(err));
      };
      this.setStatus(config.id, 'connected');
      return adapter;
    } catch (err) {
      await adapter.close().catch(() => {});
      this.setStatus(config.id, 'error', normalizeConnectionError(err));
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
