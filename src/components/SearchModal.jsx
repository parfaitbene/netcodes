import React, { useState, useEffect, useRef } from 'react';

function SearchModal({ onClose, onPageSelect }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
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
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const raw = await window.api.search.query(value);
      const grouped = {};
      raw.forEach(r => {
        if (!grouped[r.page_id]) {
          grouped[r.page_id] = {
            page_id: r.page_id,
            page_title: r.page_title,
            section_title: r.section_title,
            section_id: r.section_id,
            notebook_name: r.notebook_name,
            blocks: [],
          };
        }
        if (r.block_id) {
          grouped[r.page_id].blocks.push({
            block_title: r.block_title,
            block_content: r.block_content,
          });
        }
      });
      setResults(Object.values(grouped));
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (result) => {
    onPageSelect({ id: result.page_id, title: result.page_title, section_id: result.section_id });
    onClose();
  };

  return (
    <div
      className="search-modal-backdrop"
      onClick={onClose}
    >
      <div
        className="search-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="search-modal-input-wrapper">
          <i className="bi bi-search search-modal-icon"></i>
          <input
            ref={inputRef}
            type="text"
            className="search-modal-input"
            placeholder="Rechercher dans toutes les pages et blocs..."
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
          />
          {query && (
            <button className="search-modal-clear" onClick={() => { setQuery(''); setResults([]); inputRef.current?.focus(); }}>
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
          {!loading && query && results.length === 0 && (
            <div className="search-modal-empty">
              <i className="bi bi-search me-2"></i>
              Aucun résultat pour <strong>"{query}"</strong>
            </div>
          )}
          {!loading && results.map(result => (
            <div
              key={result.page_id}
              className="search-modal-result"
              onClick={() => handleSelect(result)}
            >
              <div className="search-modal-result-title">
                <i className="bi bi-file-text me-2 text-muted"></i>
                {result.page_title}
              </div>
              <div className="search-modal-result-meta">
                {result.notebook_name} › {result.section_title}
              </div>
              {result.blocks.slice(0, 2).map((block, i) => (
                <div key={i} className="search-modal-result-snippet">
                  {block.block_title && <span className="fw-semibold me-1">{block.block_title}:</span>}
                  {block.block_content?.substring(0, 100)}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default SearchModal;
