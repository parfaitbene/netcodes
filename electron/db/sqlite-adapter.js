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
      // SQLite désactive l'application des clés étrangères par connexion,
      // par défaut — sans ce pragma, les `ON DELETE CASCADE` de
      // schema/sqlite.sql sont décoratifs : supprimer un notebook nettoie
      // ses sections/pages/blocs sur MySQL et PostgreSQL mais les laisse
      // orphelines sur SQLite (finding 4 de la revue). Sûr sur un fichier
      // existant : les vérifications ne s'appliquent qu'aux instructions à
      // venir sur cette connexion.
      this.db.pragma('foreign_keys = ON');
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
