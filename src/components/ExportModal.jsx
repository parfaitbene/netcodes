import React, { useState } from 'react';

function ExportModal({ mode, item, notebooks, sections, pages, onClose }) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(null);

  const handleExport = async () => {
    setLoading(true);
    try {
      let result;
      if (mode === 'page') result = await window.api.export.page(item.id);
      else if (mode === 'section') result = await window.api.export.section(item.id);
      else result = await window.api.export.notebook(item.id);
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
    : item.name;

  const icon = mode === 'page' ? 'bi-file-text'
    : mode === 'section' ? 'bi-collection'
    : 'bi-journal-text';

  const scope = (() => {
    if (mode === 'page') {
      const blockCount = null;
      const sec = sections.find(s => s.id === item.section_id);
      const nb = notebooks.find(n => n.id === sec?.notebook_id);
      return `${nb?.name ?? ''} › ${sec?.title ?? ''}`;
    }
    if (mode === 'section') {
      const nb = notebooks.find(n => n.id === item.notebook_id);
      const pageCount = pages.filter(p => p.section_id === item.id).length;
      return `${nb?.name ?? ''} — ${pageCount} page${pageCount !== 1 ? 's' : ''}`;
    }
    const secCount = sections.filter(s => s.notebook_id === item.id).length;
    const pageCount = pages.filter(p => sections.some(s => s.notebook_id === item.id && s.id === p.section_id)).length;
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
            <div className="d-flex align-items-center gap-2">
              <i className="bi bi-file-earmark-word text-primary"></i>
              <span>Microsoft Word (.docx)</span>
            </div>
          </div>

          {done && (
            <div className={`alert ${done.saved ? 'alert-success' : 'alert-danger'} py-2 mb-3`}>
              {done.saved
                ? <><i className="bi bi-check-circle me-2"></i>Exporté : <small>{done.filePath}</small></>
                : <><i className="bi bi-exclamation-circle me-2"></i>{done.error ?? 'Annulé'}</>
              }
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
