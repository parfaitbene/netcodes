// Contrat commun des adaptateurs de base de données.
// Toutes les méthodes sont async ; les ops écrivent des placeholders `?`,
// chaque adaptateur traduit vers son dialecte si nécessaire.
export class DbAdapter {
  constructor(dialect) {
    this.dialect = dialect;
    // Assigné par ConnectionManager.open() une fois la connexion établie.
    // Un adaptateur qui détecte lui-même la perte de sa connexion (voir les
    // écouteurs 'error' de MySqlAdapter/PostgresAdapter) l'appelle pour que
    // le manager fasse passer le statut à 'error' — sans ce hook, une
    // déconnexion serveur en cours de session ne serait jamais signalée
    // (statut resterait bloqué à 'connected').
    this.onFatalError = null;
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
