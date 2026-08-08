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
    // id -> Symbol identifiant l'appel open()/close() le plus récent pour cet
    // id. Un open() en cours n'est pas encore dans `connections` (contrairement
    // à ce que le garde de ré-ouverture ci-dessous vérifiait auparavant), donc
    // deux open() concurrents pour le même id passaient tous les deux la garde
    // et construisaient chacun un adaptateur : le perdant n'était jamais
    // refermé (socket ou verrou WAL qui fuit), et si son échec arrivait après
    // le succès du gagnant, le statut restait à 'error' alors qu'un
    // adaptateur fonctionnel était enregistré (finding 3 de la revue). Voir
    // open()/close() ci-dessous pour le mécanisme de supersession.
    this.openTokens = new Map();
  }

  setStatus(id, state, error = null) {
    const status = { state, error };
    this.statuses.set(id, status);
    if (this.onStatusChange) this.onStatusChange(id, status);
  }

  async open(config) {
    const id = config.id;
    // Jeton unique pour CET appel. À chaque point de reprise après un await,
    // on compare `this.openTokens.get(id)` à `token` : s'ils diffèrent, un
    // open() ou close() plus récent est arrivé entre-temps et cet appel a été
    // supersédé — il referme ce qu'il vient de construire au lieu de
    // l'enregistrer ou d'écraser le statut, pour ne jamais laisser fuiter une
    // ressource ni ressusciter un statut périmé (double-clic sur
    // « Reconnecter », remove pendant une connexion de plusieurs secondes…).
    const token = Symbol(id);
    this.openTokens.set(id, token);
    const stillCurrent = () => this.openTokens.get(id) === token;

    // Ré-ouverture : si une instance est déjà enregistrée, la fermer d'abord.
    // On la retire et on la referme directement (sans passer par close())
    // pour ne pas invalider le jeton qu'on vient de poser.
    if (this.connections.has(id)) {
      const previous = this.connections.get(id);
      this.connections.delete(id);
      await previous.adapter.close().catch(() => {});
    }

    const Adapter = ADAPTERS[config.type];
    if (!Adapter) {
      if (stillCurrent()) this.setStatus(id, 'error', `Type de connexion inconnu : ${config.type}`);
      throw new Error(`Type de connexion inconnu : ${config.type}`);
    }
    if (stillCurrent()) this.setStatus(id, 'connecting');
    const adapter = new Adapter(config);
    try {
      await adapter.open();
      await adapter.exec(loadSchema(config.type));

      if (!stillCurrent()) {
        // Supersédé pendant l'ouverture : ne jamais enregistrer cet
        // adaptateur ni toucher au statut, qui appartient désormais à
        // l'appel le plus récent (ou à un close() survenu entre-temps).
        // On referme simplement ce qu'on vient d'ouvrir.
        await adapter.close().catch(() => {});
        return adapter;
      }

      this.connections.set(id, { adapter, config });
      // Un serveur qui meurt en cours de session (redémarrage MySQL/PG)
      // n'appelle jamais open()/close() : sans ce hook, le statut resterait
      // bloqué à 'connected' indéfiniment (finding 2 de la revue). Le
      // contrôle d'identité (`current.adapter !== adapter`) protège contre
      // une erreur tardive d'un adaptateur déjà remplacé/fermé (reconnexion
      // entre-temps) qui ressusciterait un statut périmé.
      adapter.onFatalError = (err) => {
        const current = this.connections.get(id);
        if (!current || current.adapter !== adapter) return;
        this.setStatus(id, 'error', normalizeConnectionError(err));
      };
      this.setStatus(id, 'connected');
      return adapter;
    } catch (err) {
      await adapter.close().catch(() => {});
      if (stillCurrent()) this.setStatus(id, 'error', normalizeConnectionError(err));
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
    // Invalide tout open() en cours pour cet id : « close() doit gagner » —
    // l'open() concurrent, en complétant, se verra supersédé (cf. open()
    // ci-dessus) et refermera l'adaptateur qu'il vient de construire au lieu
    // de le réenregistrer par-dessus cette fermeture (finding 3 de la revue).
    this.openTokens.set(id, Symbol(id));
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
    this.openTokens.clear();
  }
}

export const manager = new ConnectionManager();
