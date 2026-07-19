import React, { useState, useEffect, useRef } from 'react';

const LANGUAGES = [
  'javascript', 'typescript', 'python', 'java', 'csharp', 'cpp', 'c',
  'go', 'rust', 'php', 'ruby', 'swift', 'kotlin', 'html', 'css', 'scss',
  'json', 'yaml', 'xml', 'sql', 'markdown', 'shell', 'plaintext',
];

const LANGUAGE_LABELS = {
  javascript: 'JavaScript', typescript: 'TypeScript', python: 'Python',
  java: 'Java', csharp: 'C#', cpp: 'C++', c: 'C', go: 'Go', rust: 'Rust',
  php: 'PHP', ruby: 'Ruby', swift: 'Swift', kotlin: 'Kotlin', html: 'HTML',
  css: 'CSS', scss: 'SCSS', json: 'JSON', yaml: 'YAML', xml: 'XML',
  sql: 'SQL', markdown: 'Markdown', shell: 'Shell', plaintext: 'Plain Text',
};

function SearchModal({ onClose, onNotebookSelect, onSectionSelect, onPageSelect }) {
  const [query, setQuery] = useState('');
  const [allResults, setAllResults] = useState({ notebooks: [], sections: [], pages: [] });
  const [loading, setLoading] = useState(false);

  // Filters
  const [filterFavorites, setFilterFavorites] = useState(false);
  const [filterType, setFilterType] = useState('all'); // 'all' | 'text' | 'code'
  const [filterLanguage, setFilterLanguage] = useState('');

  const inputRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 500);
    return () => clearTimeout(t);
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
      setAllResults({ notebooks: [], sections: [], pages: [] });
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
            favorite: !!r.page_favorite,
            section_id: r.section_id,
            section_title: r.section_title,
            notebook_name: r.notebook_name,
            blocks: [],
            // Track unique block ids to avoid duplicates from DISTINCT
            _blockIds: new Set(),
          };
        }
        if (r.block_id && !pagesMap[r.page_id]._blockIds.has(r.block_id)) {
          pagesMap[r.page_id]._blockIds.add(r.block_id);
          pagesMap[r.page_id].blocks.push({
            block_title: r.block_title,
            block_content: r.block_content,
            block_type: r.block_type,
            block_language: r.block_language,
          });
        }
      });

      setAllResults({
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

  // Apply filters
  const filteredPages = allResults.pages.filter(p => {
    if (filterFavorites && !p.favorite) return false;
    // No block-level filter active: show all pages
    if (filterType === 'all' && !filterLanguage) return true;
    // Block-level filter: page must have at least one matching block
    if (p.blocks.length === 0) return false;
    return p.blocks.some(b => {
      if (filterType !== 'all' && b.block_type !== filterType) return false;
      if (filterLanguage && b.block_language !== filterLanguage) return false;
      return true;
    });
  });

  const grouped = {
    notebooks: filterFavorites || filterType !== 'all' || filterLanguage ? [] : allResults.notebooks,
    sections: filterFavorites || filterType !== 'all' || filterLanguage ? [] : allResults.sections,
    pages: filteredPages,
  };

  const total = grouped.notebooks.length + grouped.sections.length + grouped.pages.length;
  const hasActiveFilter = filterFavorites || filterType !== 'all' || filterLanguage;

  const resetFilters = () => {
    setFilterFavorites(false);
    setFilterType('all');
    setFilterLanguage('');
  };

  return (
    <div className="search-modal-backdrop" onClick={onClose}>
      <div className="search-modal" style={{ width: 680 }} onClick={(e) => e.stopPropagation()}>
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
            <button className="search-modal-clear" onClick={() => { setQuery(''); setAllResults({ notebooks: [], sections: [], pages: [] }); inputRef.current?.focus(); }}>
              <i className="bi bi-x-lg"></i>
            </button>
          )}
        </div>

        {/* Filter bar */}
        <div style={{ padding: '8px 12px', borderBottom: '1px solid #dee2e6', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', background: '#f8f9fa' }}>
          <button
            className={`btn btn-sm ${filterFavorites ? 'btn-warning' : 'btn-outline-secondary'}`}
            onClick={() => setFilterFavorites(prev => !prev)}
            title="Favoris uniquement"
          >
            <i className={`bi bi-star${filterFavorites ? '-fill' : ''} me-1`}></i>
            Favoris
          </button>

          <div className="btn-group btn-group-sm">
            <button
              className={`btn ${filterType === 'all' ? 'btn-secondary' : 'btn-outline-secondary'}`}
              onClick={() => { setFilterType('all'); setFilterLanguage(''); }}
            >
              Tous
            </button>
            <button
              className={`btn ${filterType === 'text' ? 'btn-secondary' : 'btn-outline-secondary'}`}
              onClick={() => { setFilterType('text'); setFilterLanguage(''); }}
            >
              <i className="bi bi-textarea-t me-1"></i>Texte
            </button>
            <button
              className={`btn ${filterType === 'code' ? 'btn-secondary' : 'btn-outline-secondary'}`}
              onClick={() => setFilterType('code')}
            >
              <i className="bi bi-code-slash me-1"></i>Code
            </button>
          </div>

          {filterType === 'code' && (
            <select
              className="form-select form-select-sm"
              style={{ width: 'auto' }}
              value={filterLanguage}
              onChange={(e) => setFilterLanguage(e.target.value)}
            >
              <option value="">Tous les langages</option>
              {LANGUAGES.map(l => (
                <option key={l} value={l}>{LANGUAGE_LABELS[l]}</option>
              ))}
            </select>
          )}

          {hasActiveFilter && (
            <button
              className="btn btn-sm btn-link text-danger p-0 ms-auto"
              onClick={resetFilters}
              title="Réinitialiser les filtres"
            >
              <i className="bi bi-x-circle me-1"></i>Réinitialiser
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
              Aucun résultat {hasActiveFilter ? 'avec ces filtres' : ''} pour <strong>"{query}"</strong>
            </div>
          )}
          {!loading && !query && (
            <div className="search-modal-empty" style={{ fontSize: '0.85rem' }}>
              Tapez pour rechercher…
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
              {grouped.pages.map(p => {
                const blocksToShow = p.blocks.filter(b => {
                  if (filterType !== 'all' && b.block_type !== filterType) return false;
                  if (filterLanguage && b.block_language !== filterLanguage) return false;
                  return true;
                }).slice(0, 2);

                return (
                  <div key={p.id} className="search-modal-result" onClick={() => { onPageSelect(p); onClose(); }}>
                    <div className="search-modal-result-title">
                      {p.favorite && <i className="bi bi-star-fill text-warning me-1" style={{ fontSize: '0.75rem' }}></i>}
                      <i className="bi bi-file-text me-2 text-muted"></i>
                      {p.title}
                    </div>
                    <div className="search-modal-result-meta">
                      {p.notebook_name} › {p.section_title}
                    </div>
                    {blocksToShow.map((b, i) => (
                      <div key={i} className="search-modal-result-snippet">
                        {b.block_type === 'code' && b.block_language && (
                          <span className="badge bg-secondary me-1" style={{ fontSize: '0.65rem' }}>{LANGUAGE_LABELS[b.block_language] ?? b.block_language}</span>
                        )}
                        {b.block_title && <span className="fw-semibold me-1">{b.block_title}:</span>}
                        {b.block_content?.substring(0, 100)}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SearchModal;
