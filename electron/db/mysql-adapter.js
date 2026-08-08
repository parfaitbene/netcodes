import mysql from 'mysql2/promise';
import { DbAdapter } from './adapter.js';

export class MySqlAdapter extends DbAdapter {
  constructor(config) {
    super('mysql');
    this.config = config;
    this.conn = null;
    this.lastError = null;
  }

  async open() {
    try {
      const conn = await mysql.createConnection({
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
      // mysql2 émet 'error' sur perte de connexion inattendue ; sans écouteur,
      // Node relance l'erreur et tue le process main Electron. On informe
      // aussi le manager (onFatalError) pour que le statut passe à 'error' —
      // sinon un redémarrage serveur en cours de session laisse le statut
      // bloqué à 'connected' indéfiniment (finding 2 de la revue).
      conn.on('error', (err) => {
        this.lastError = err;
        console.error('Connexion MySQL perdue :', err.message);
        this.onFatalError?.(err);
      });
      this.conn = conn;
    } catch (err) {
      this.conn = null;
      throw err;
    }
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
