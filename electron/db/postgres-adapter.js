import pg from 'pg';
import { DbAdapter } from './adapter.js';

// Convertit les placeholders `?` en `$1, $2…`.
// Sûr ici : aucun `?` littéral dans le SQL des ops (les valeurs passent en params).
function toPgPlaceholders(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

export class PostgresAdapter extends DbAdapter {
  constructor(config) {
    super('postgres');
    this.config = config;
    this.client = null;
  }

  async open() {
    this.client = new pg.Client({
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.user,
      password: this.config.password,
      connectionTimeoutMillis: 5000,
    });
    await this.client.connect();
  }

  async all(sql, params = []) {
    const r = await this.client.query(toPgPlaceholders(sql), params);
    return r.rows;
  }
  async get(sql, params = []) {
    return (await this.all(sql, params))[0];
  }
  async run(sql, params = []) {
    const r = await this.client.query(toPgPlaceholders(sql), params);
    return { changes: r.rowCount ?? 0 };
  }
  async insert(sql, params = []) {
    const r = await this.client.query(`${toPgPlaceholders(sql)} RETURNING id`, params);
    return r.rows[0].id;
  }
  async exec(sql) {
    await this.client.query(sql);
  }

  async transaction(fn) {
    await this.client.query('BEGIN');
    try {
      const out = await fn(this);
      await this.client.query('COMMIT');
      return out;
    } catch (err) {
      await this.client.query('ROLLBACK');
      throw err;
    }
  }

  async close() {
    if (this.client) {
      await this.client.end();
      this.client = null;
    }
  }
}
