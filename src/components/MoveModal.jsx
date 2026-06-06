import React, { useEffect, useState } from 'react';

/**
 * mode "page"    : choisir une section destination (affiche "Notebook > Section")
 * mode "section" : choisir un notebook destination
 */
function MoveModal({ mode, itemName, notebooks, sections, onMove, onClose }) {
  const [filter, setFilter] = useState('');

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const lf = filter.toLowerCase();

  const destinations = mode === 'page'
    ? sections
        .map(s => {
          const nb = notebooks.find(n => n.id === s.notebook_id);
          return { id: s.id, label: `${nb?.name ?? '?'} › ${s.title}`, sublabel: nb?.name ?? '' };
        })
        .filter(d => d.label.toLowerCase().includes(lf))
    : notebooks
        .map(n => ({ id: n.id, label: `${n.icon} ${n.name}`, sublabel: '' }))
        .filter(d => d.label.toLowerCase().includes(lf));

  return (
    <div className="search-modal-backdrop" onClick={onClose}>
      <div className="search-modal" onClick={(e) => e.stopPropagation()}>

        <div className="search-modal-input-wrapper">
          <i className="bi bi-arrow-right-square search-modal-icon"></i>
          <input
            type="text"
            className="search-modal-input"
            placeholder={mode === 'page' ? 'Filtrer les sections...' : 'Filtrer les notebooks...'}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            autoFocus
          />
          {filter && (
            <button className="search-modal-clear" onClick={() => setFilter('')}>
              <i className="bi bi-x-lg"></i>
            </button>
          )}
        </div>

        <div className="move-modal-header">
          Déplacer <strong>"{itemName}"</strong> vers&nbsp;:
        </div>

        <div className="search-modal-body">
          {destinations.length === 0 ? (
            <div className="search-modal-empty">Aucune destination trouvée</div>
          ) : (
            destinations.map(dest => (
              <div
                key={dest.id}
                className="search-modal-result"
                onClick={() => { onMove(dest.id); onClose(); }}
              >
                <div className="search-modal-result-title">
                  {mode === 'page'
                    ? <><i className="bi bi-collection me-2 text-success"></i>{dest.label}</>
                    : <><i className="bi bi-journal-text me-2 text-primary"></i>{dest.label}</>
                  }
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default MoveModal;
