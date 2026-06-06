import React, { useState, useEffect, useRef } from 'react';

function SearchModal({ onClose, onNotebookSelect, onSectionSelect, onPageSelect }) {
  const [query, setQuery] = useState('');
  const [grouped, setGrouped] = useState({ notebooks: [], sections: [], pages: [] });
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleSearch = async (value) => {
    setQuery(value);
    if (!value.trim()) {
      setGrouped({ notebooks: [], sections: [], pages: [] });
      return;
    }
    setLoading(true);
    try {
      const { notebooks, sections, pages: rawPages } = await window.api.search.query(value);

      const pagesMap = {};
      rawPages.forEach(r => {
        if (!pagesMap[r.page_id]) {
          pagesMap[r.page_id] = {
            id: r.page_id,
            title: r.page_title,
            section_id: r.section_id,
            section_title: r.section_title,
            notebook_name: r.notebook_name,
            blocks: [],
          };
        }
        if (r.block_id) {
          pagesMap[r.page_id].blocks.push({
            block_title: r.block_title,
            block_content: r.block_content,
          });
        }
      });

      setGrouped({
        notebooks: notebooks.map(n => ({ id: n.notebook_id, name: n.notebook_name })),
        sections: sections.map(s => ({
          id: s.section_id,
          title: s.section_title,
          notebook_id: s.notebook_id,
          notebook_name: s.notebook_name,
        })),
        pages: Object.values(pagesMap),
      });
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setLoading(false);
    }
  };

  const total = grouped.notebooks.length + grouped.sections.length + grouped.pages.length;

  return (
    <div className="search-modal-backdrop" onClick={onClose}>
      <div className="search-modal" onClick={(e) => e.stopPropagation()}>
        <div className="search-modal-input-wrapper">
          <i className="bi bi-search search-modal-icon"></i>
          <input
            ref={inputRef}
            type="text"
            className="search-modal-input"
            placeholder="Rechercher notebooks, sections, pages et blocs..."
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
          />
          {query && (
            <button className="search-modal-clear" onClick={() => { setQuery(''); setGrouped({ notebooks: [], sections: [], pages: [] }); inputRef.current?.focus(); }}>
              <i className="bi bi-x-lg"></i>
            </button>
          )}
        </div>

        <div className="search-modal-body">
          {loading && (
            <div className="search-modal-empty">
              <div className="spinner-border spinner-border-sm text-secondary" role="status"></div>
            </div>
          )}
          {!loading && query && total === 0 && (
            <div className="search-modal-empty">
              <i className="bi bi-search me-2"></i>
              Aucun résultat pour <strong>"{query}"</strong>
            </div>
          )}

          {!loading && grouped.notebooks.length > 0 && (
            <div>
              <div className="search-modal-group-label">Notebooks</div>
              {grouped.notebooks.map(n => (
                <div key={n.id} className="search-modal-result" onClick={() => { onNotebookSelect(n); onClose(); }}>
                  <div className="search-modal-result-title">
                    <i className="bi bi-journal-text me-2 text-primary"></i>
                    {n.name}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && grouped.sections.length > 0 && (
            <div>
              <div className="search-modal-group-label">Sections</div>
              {grouped.sections.map(s => (
                <div key={s.id} className="search-modal-result" onClick={() => { onSectionSelect(s); onClose(); }}>
                  <div className="search-modal-result-title">
                    <i className="bi bi-collection me-2 text-success"></i>
                    {s.title}
                  </div>
                  <div className="search-modal-result-meta">{s.notebook_name}</div>
                </div>
              ))}
            </div>
          )}

          {!loading && grouped.pages.length > 0 && (
            <div>
              <div className="search-modal-group-label">Pages</div>
              {grouped.pages.map(p => (
                <div key={p.id} className="search-modal-result" onClick={() => { onPageSelect(p); onClose(); }}>
                  <div className="search-modal-result-title">
                    <i className="bi bi-file-text me-2 text-muted"></i>
                    {p.title}
                  </div>
                  <div className="search-modal-result-meta">
                    {p.notebook_name} › {p.section_title}
                  </div>
                  {p.blocks.slice(0, 2).map((b, i) => (
                    <div key={i} className="search-modal-result-snippet">
                      {b.block_title && <span className="fw-semibold me-1">{b.block_title}:</span>}
                      {b.block_content?.substring(0, 100)}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SearchModal;
