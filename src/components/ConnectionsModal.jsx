import React, { useState } from 'react';

const EMPTY_FORM = { name: '', type: 'sqlite', file: '', host: '', port: '', database: '', user: '', password: '' };
const DEFAULT_PORTS = { mysql: 3306, postgres: 5432 };
const STATE_LABELS = { connected: 'Connectée', connecting: 'Connexion…', error: 'Erreur', closed: 'Fermée' };
const STATE_COLORS = { connected: 'success', connecting: 'warning', error: 'danger', closed: 'secondary' };
const PORT_MIN = 1;
const PORT_MAX = 65535;

// Port optionnel : une valeur vide est valide (le port par défaut du type
// s'applique). Quand une valeur est fournie, elle doit être un entier dans
// la plage TCP valide — sinon `Number(...) || DEFAULT_PORTS[...]` de
// `buildCfg` accepterait à tort des valeurs négatives/décimales (truthy).
function isValidPort(value) {
  if (value === '' || value === null || value === undefined) return true;
  const n = Number(value);
  return Number.isInteger(n) && n >= PORT_MIN && n <= PORT_MAX;
}

function ConnectionsModal({ connections, onClose, onChanged }) {
  const [editing, setEditing] = useState(null); // null | 'new' | connId
  const [form, setForm] = useState(EMPTY_FORM);
  const [testResult, setTestResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const [rowErrors, setRowErrors] = useState({}); // connId -> message (erreurs de suppression/reconnexion dans la liste)

  const startEdit = (conn) => {
    setTestResult(null);
    if (conn) {
      setEditing(conn.id);
      setForm({ ...EMPTY_FORM, ...conn, port: conn.port ?? '', password: '' });
    } else {
      setEditing('new');
      setForm(EMPTY_FORM);
    }
  };

  // Le champ fichier SQLite ne s'édite jamais à la main (voir CLAUDE.md
  // spec 2.0.0) : seuls ces deux dialogs natifs peuvent le renseigner.
  const handleChooseExistingFile = async () => {
    const r = await window.api.dialog.chooseSqliteFile();
    if (r && !r.canceled && r.filePath) {
      setTestResult(null);
      setForm(f => ({ ...f, file: r.filePath }));
    }
  };

  const handleCreateNewFile = async () => {
    const r = await window.api.dialog.createSqliteFile();
    if (r && !r.canceled && r.filePath) {
      setTestResult(null);
      setForm(f => ({ ...f, file: r.filePath }));
    }
  };

  const buildCfg = () => {
    const cfg = { name: form.name.trim(), type: form.type };
    if (form.type === 'sqlite') {
      cfg.file = form.file.trim();
    } else {
      cfg.host = form.host.trim();
      cfg.port = Number(form.port) || DEFAULT_PORTS[form.type];
      cfg.database = form.database.trim();
      cfg.user = form.user.trim();
      if (form.password) cfg.password = form.password;
    }
    return cfg;
  };

  const isValid = () => {
    if (!form.name.trim()) return false;
    if (form.type === 'sqlite') return Boolean(form.file.trim());
    if (!isValidPort(form.port)) return false;
    return Boolean(form.host.trim() && form.database.trim() && form.user.trim());
  };

  const handleTest = async () => {
    setTestResult({ pending: true });
    const cfg = buildCfg();
    if (editing !== 'new') cfg.id = editing; // reprendre le mdp stocké si champ vide
    try {
      const r = await window.api.connections.test(cfg);
      setTestResult(r);
    } catch (err) {
      // L'appel IPC peut rejeter (ex. exception synchrone côté main) plutôt
      // que résoudre { ok: false, error } — sans ce catch, `pending` reste
      // bloqué à true : bouton désactivé, spinner à l'infini, sans message.
      setTestResult({ ok: false, error: `Échec du test : ${err.message}` });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editing === 'new') await window.api.connections.add(buildCfg());
      else await window.api.connections.update(editing, buildCfg());
      setEditing(null);
      await onChanged?.();
    } catch (err) {
      // Réutilise la zone d'alerte du test : le formulaire reste ouvert
      // (pas de setEditing(null)) et l'erreur reste visible jusqu'à la
      // prochaine modification de champ (set() la réinitialise déjà).
      setTestResult({ ok: false, error: `Échec de l'enregistrement : ${err.message}` });
    } finally {
      setSaving(false);
    }
  };

  const clearRowError = (connId) => {
    setRowErrors(prev => {
      if (!(connId in prev)) return prev;
      const next = { ...prev };
      delete next[connId];
      return next;
    });
  };

  const handleRemove = async (conn) => {
    if (window.confirm(`Retirer la connexion « ${conn.name} » ?\nLes données de la base ne seront pas supprimées.`)) {
      clearRowError(conn.id);
      try {
        await window.api.connections.remove(conn.id);
        await onChanged?.();
      } catch (err) {
        setRowErrors(prev => ({ ...prev, [conn.id]: `Échec de la suppression : ${err.message}` }));
      }
    }
  };

  const handleReconnect = async (conn) => {
    clearRowError(conn.id);
    try {
      const r = await window.api.connections.reconnect(conn.id);
      if (r && r.ok === false) {
        setRowErrors(prev => ({ ...prev, [conn.id]: `Échec de la reconnexion : ${r.error}` }));
        return;
      }
      await onChanged?.();
    } catch (err) {
      setRowErrors(prev => ({ ...prev, [conn.id]: `Échec de la reconnexion : ${err.message}` }));
    }
  };

  // Toute modification du formulaire invalide un test précédent : on force à
  // re-tester avant d'enregistrer plutôt que de laisser un résultat obsolète
  // à l'écran (ex. hôte corrigé après un test réussi sur l'ancien hôte).
  const set = (field) => (e) => {
    setTestResult(null);
    setForm(f => ({ ...f, [field]: e.target.value }));
  };

  return (
    <div className="search-modal-backdrop" onClick={onClose}>
      <div className="search-modal" style={{ width: 640 }} onClick={(e) => e.stopPropagation()}>
        <div className="p-3 border-bottom d-flex align-items-center">
          <h6 className="mb-0 flex-grow-1"><i className="bi bi-database me-2"></i>Connexions aux bases de données</h6>
          <button className="btn btn-sm btn-primary" onClick={() => startEdit(null)}>
            <i className="bi bi-plus-circle me-1"></i>Ajouter
          </button>
        </div>

        <div className="p-3" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          {editing === null ? (
            connections.length === 0 ? (
              <p className="text-muted small mb-0">Aucune connexion. Cliquez sur « Ajouter ».</p>
            ) : (
              connections.map(conn => {
                const state = conn.status?.state ?? 'closed';
                return (
                  <div key={conn.id} className="d-flex align-items-center gap-2 py-2 border-bottom">
                    <span className={`badge bg-${STATE_COLORS[state]}`}>{STATE_LABELS[state]}</span>
                    <div className="flex-grow-1">
                      <div className="fw-semibold">{conn.name} <span className="text-muted small">({conn.type})</span></div>
                      <div className="text-muted small text-truncate">
                        {conn.type === 'sqlite' ? conn.file : `${conn.user}@${conn.host}:${conn.port}/${conn.database}`}
                      </div>
                      {state === 'error' && <div className="text-danger small">{conn.status.error}</div>}
                      {rowErrors[conn.id] && <div className="text-danger small">{rowErrors[conn.id]}</div>}
                    </div>
                    {state === 'error' && (
                      <button className="btn btn-sm btn-outline-warning" title="Reconnecter"
                        onClick={() => handleReconnect(conn)}>
                        <i className="bi bi-arrow-clockwise"></i>
                      </button>
                    )}
                    <button className="btn btn-sm btn-outline-secondary" title="Modifier" onClick={() => startEdit(conn)}>
                      <i className="bi bi-pencil"></i>
                    </button>
                    <button className="btn btn-sm btn-outline-danger" title="Retirer" onClick={() => handleRemove(conn)}>
                      <i className="bi bi-trash"></i>
                    </button>
                  </div>
                );
              })
            )
          ) : (
            <div>
              <div className="mb-2">
                <label className="form-label small mb-1">Nom</label>
                <input className="form-control form-control-sm" value={form.name} onChange={set('name')} placeholder="Perso, Travail…" />
              </div>
              <div className="mb-2">
                <label className="form-label small mb-1">Type</label>
                <select className="form-select form-select-sm" value={form.type} onChange={set('type')} disabled={editing !== 'new'}>
                  <option value="sqlite">SQLite (fichier)</option>
                  <option value="mysql">MySQL</option>
                  <option value="postgres">PostgreSQL</option>
                </select>
              </div>
              {form.type === 'sqlite' ? (
                <div className="mb-2">
                  <label className="form-label small mb-1">Fichier</label>
                  {form.file ? (
                    <input className="form-control form-control-sm text-truncate mb-2" value={form.file}
                      readOnly title={form.file} />
                  ) : (
                    <p className="text-muted small mb-2">
                      Aucun fichier sélectionné. Choisissez une base existante ou créez-en une nouvelle.
                    </p>
                  )}
                  <div className="d-flex gap-2">
                    <button type="button" className="btn btn-sm btn-outline-secondary" onClick={handleChooseExistingFile}>
                      <i className="bi bi-folder2-open me-1"></i>Choisir un fichier existant
                    </button>
                    <button type="button" className="btn btn-sm btn-outline-secondary" onClick={handleCreateNewFile}>
                      <i className="bi bi-file-earmark-plus me-1"></i>Créer un nouveau fichier
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="row g-2 mb-2">
                    <div className="col-8">
                      <label className="form-label small mb-1">Hôte</label>
                      <input className="form-control form-control-sm" value={form.host} onChange={set('host')} />
                    </div>
                    <div className="col-4">
                      <label className="form-label small mb-1">Port</label>
                      <input className="form-control form-control-sm" type="number" value={form.port}
                        onChange={set('port')} placeholder={String(DEFAULT_PORTS[form.type])}
                        min={PORT_MIN} max={PORT_MAX} step={1} />
                    </div>
                  </div>
                  <div className="mb-2">
                    <label className="form-label small mb-1">Base de données</label>
                    <input className="form-control form-control-sm" value={form.database} onChange={set('database')} />
                  </div>
                  <div className="row g-2 mb-2">
                    <div className="col-6">
                      <label className="form-label small mb-1">Utilisateur</label>
                      <input className="form-control form-control-sm" value={form.user} onChange={set('user')} />
                    </div>
                    <div className="col-6">
                      <label className="form-label small mb-1">Mot de passe</label>
                      <input className="form-control form-control-sm" type="password" value={form.password}
                        onChange={set('password')}
                        placeholder={editing !== 'new' ? '(inchangé si vide)' : ''} />
                    </div>
                  </div>
                </>
              )}

              {testResult && !testResult.pending && (
                <div className={`alert alert-${testResult.ok ? 'success' : 'danger'} py-1 px-2 small mb-2`}>
                  {testResult.ok ? 'Connexion réussie.' : testResult.error}
                </div>
              )}

              <div className="d-flex gap-2 mt-3">
                <button className="btn btn-sm btn-outline-secondary" onClick={handleTest}
                  disabled={!isValid() || testResult?.pending}>
                  {testResult?.pending
                    ? <span className="spinner-border spinner-border-sm"></span>
                    : <><i className="bi bi-plug me-1"></i>Tester</>}
                </button>
                <div className="flex-grow-1"></div>
                <button className="btn btn-sm btn-secondary" onClick={() => setEditing(null)}>Annuler</button>
                <button className="btn btn-sm btn-primary" onClick={handleSave} disabled={!isValid() || saving}>
                  Enregistrer
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ConnectionsModal;
