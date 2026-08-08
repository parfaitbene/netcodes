import React, { useState } from 'react';

function ExportModal({ mode, item, connId, notebooks, sections, pages, onClose }) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(null);
  const [format, setFormat] = useState('docx');
  const [blockLayout, setBlockLayout] = useState('merged');

  // App still passes the full multi-connection notebooks/sections/pages
  // arrays (they're also used elsewhere for Sidebar/PagesList). Ids are only
  // unique WITHIN a connection, so every ancestry lookup below (section of a
  // page, notebook of a section, etc.) must be scoped to `connId` — matching
  // on the bare id alone could resolve to a same-id row in a different
  // connection.
  const connNotebooks = notebooks.filter(n => n.connId === connId);
  const connSections = sections.filter(s => s.connId === connId);
  const connPages = pages.filter(p => p.connId === connId);

  const handleExport = async () => {
    setLoading(true);
    try {
      let result;
      if (mode === 'page') result = await window.api.export.page(connId, item.id, format, blockLayout);
      else if (mode === 'section') result = await window.api.export.section(connId, item.id, format, blockLayout);
      else if (mode === 'block') result = await window.api.export.block(connId, item.id, format);
      else result = await window.api.export.notebook(connId, item.id, format, blockLayout);
      console.log('[ExportModal] result:', result);
      setDone(result);
    } catch (err) {
      setDone({ saved: false, error: err.message });
    } finally {
      setLoading(false);
    }
  };

  const label = mode === 'page' ? item.title
    : mode === 'section' ? item.title
    : mode === 'block' ? (item.title || (item.type === 'code' ? 'Bloc de code' : 'Bloc de texte'))
    : item.name;

  const icon = mode === 'page' ? 'bi-file-text'
    : mode === 'section' ? 'bi-collection'
    : mode === 'block' ? (item.type === 'code' ? 'bi-code-slash' : 'bi-textarea-t')
    : 'bi-journal-text';

  const scope = (() => {
    if (mode === 'page') {
      const sec = connSections.find(s => s.id === item.section_id);
      const nb = connNotebooks.find(n => n.id === sec?.notebook_id);
      return `${nb?.name ?? ''} › ${sec?.title ?? ''}`;
    }
    if (mode === 'section') {
      const nb = connNotebooks.find(n => n.id === item.notebook_id);
      const pageCount = connPages.filter(p => p.section_id === item.id).length;
      return `${nb?.name ?? ''} — ${pageCount} page${pageCount !== 1 ? 's' : ''}`;
    }
    if (mode === 'block') {
      const page = connPages.find(p => p.id === item.page_id);
      const sec = connSections.find(s => s.id === page?.section_id);
      const nb = connNotebooks.find(n => n.id === sec?.notebook_id);
      return `${nb?.name ?? ''} › ${sec?.title ?? ''} › ${page?.title ?? ''}`;
    }
    const secCount = connSections.filter(s => s.notebook_id === item.id).length;
    const pageCount = connPages.filter(p => connSections.some(s => s.notebook_id === item.id && s.id === p.section_id)).length;
    return `${secCount} section${secCount !== 1 ? 's' : ''}, ${pageCount} page${pageCount !== 1 ? 's' : ''}`;
  })();

  return (
    <div className="search-modal-backdrop" onClick={onClose}>
      <div className="search-modal" style={{ maxHeight: 'unset' }} onClick={e => e.stopPropagation()}>

        <div className="search-modal-input-wrapper">
          <i className={`bi ${icon} search-modal-icon`}></i>
          <span className="search-modal-input fw-semibold">{label}</span>
          <button className="search-modal-clear" onClick={onClose}>
            <i className="bi bi-x-lg"></i>
          </button>
        </div>

        <div style={{ padding: '20px 24px' }}>
          <div className="mb-3">
            <div className="text-muted small mb-1">Périmètre d'export</div>
            <div className="d-flex align-items-center gap-2">
              <i className="bi bi-diagram-3 text-muted"></i>
              <span>{scope}</span>
            </div>
          </div>

          <div className="mb-4">
            <div className="text-muted small mb-1">Format</div>
            <select
              className="form-select form-select-sm"
              style={{ maxWidth: 240 }}
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              disabled={loading || done?.saved}
            >
              <option value="docx">Microsoft Word (.docx)</option>
              <option value="md">Markdown (.md)</option>
            </select>
          </div>

          {mode !== 'block' && (
            <div className="mb-4">
              <div className="text-muted small mb-1">Organisation des blocs</div>
              <div className="d-flex flex-column gap-1">
                <label className="d-flex align-items-center gap-2" style={{ cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="blockLayout"
                    checked={blockLayout === 'merged'}
                    onChange={() => setBlockLayout('merged')}
                    disabled={loading || done?.saved}
                  />
                  <span>Un seul fichier par page (blocs fusionnés)</span>
                </label>
                <label className="d-flex align-items-center gap-2" style={{ cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="blockLayout"
                    checked={blockLayout === 'split'}
                    onChange={() => setBlockLayout('split')}
                    disabled={loading || done?.saved}
                  />
                  <span>Un fichier par bloc (dossier par page)</span>
                </label>
              </div>
              {mode !== 'page' && (
                <div className="text-muted small mt-2">
                  <i className="bi bi-info-circle me-1"></i>
                  L'arborescence Notebook / Section / Page sera reproduite dans le dossier choisi.
                </div>
              )}
            </div>
          )}

          {done && (
            <div className={`alert ${done.saved ? 'alert-success' : 'alert-danger'} py-2 mb-3`}>
              {done.saved ? (
                <div>
                  <div className="mb-1">
                    <i className="bi bi-check-circle me-2"></i>Export réussi
                  </div>
                  <div className="text-muted small mb-2" style={{ wordBreak: 'break-all' }}>
                    {done.filePath}
                  </div>
                  <div className="d-flex gap-2 flex-wrap">
                    {done.isDir ? (
                      <button
                        className="btn btn-sm btn-outline-success"
                        onClick={() => window.api.shell.openPath(done.filePath)}
                      >
                        <i className="bi bi-folder2-open me-1"></i>Ouvrir le dossier
                      </button>
                    ) : (
                      <>
                        <button
                          className="btn btn-sm btn-outline-success"
                          onClick={() => window.api.shell.showItemInFolder(done.filePath)}
                        >
                          <i className="bi bi-folder2-open me-1"></i>Afficher dans le dossier
                        </button>
                        <button
                          className="btn btn-sm btn-outline-primary"
                          onClick={() => window.api.shell.openPath(done.filePath)}
                        >
                          <i className="bi bi-box-arrow-up-right me-1"></i>Ouvrir le fichier
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <><i className="bi bi-exclamation-circle me-2"></i>{done.error ?? 'Annulé'}</>
              )}
            </div>
          )}

          <div className="d-flex gap-2 justify-content-end">
            <button className="btn btn-secondary btn-sm" onClick={onClose}>Fermer</button>
            {!done?.saved && (
              <button
                className="btn btn-primary btn-sm"
                onClick={handleExport}
                disabled={loading}
              >
                {loading
                  ? <><span className="spinner-border spinner-border-sm me-2"></span>Export en cours...</>
                  : <><i className="bi bi-download me-2"></i>Exporter</>
                }
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ExportModal;
