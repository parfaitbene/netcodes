// Contrat commun des adaptateurs de base de données.
// Toutes les méthodes sont async ; les ops écrivent des placeholders `?`,
// chaque adaptateur traduit vers son dialecte si nécessaire.
export class DbAdapter {
  constructor(dialect) {
    this.dialect = dialect;
  }
  async open() { throw new Error('not implemented'); }
  async all(_sql, _params = []) { throw new Error('not implemented'); }
  async get(_sql, _params = []) { throw new Error('not implemented'); }
  async run(_sql, _params = []) { throw new Error('not implemented'); }
  async insert(_sql, _params = []) { throw new Error('not implemented'); }
  async exec(_sql) { throw new Error('not implemented'); }
  async transaction(_fn) { throw new Error('not implemented'); }
  async close() { throw new Error('not implemented'); }
}
