import React, { useState } from 'react';

function Sidebar({
  notebooks,
  sections,
  selectedNotebook,
  selectedSection,
  onNotebookSelect,
  onSectionSelect,
  onCreateNotebook,
  onCreateSection,
  onDeleteNotebook,
  onDeleteSection,
  onUpdateNotebook,
  onUpdateSection,
  searchQuery,
  searchResults,
  onSearchChange,
  onSearch,
  onPageSelect,
  pages = [],
  style,
}) {
  const [expandedNotebooks, setExpandedNotebooks] = useState(
    notebooks.map(n => n.id)
  );
  const [editingNotebookId, setEditingNotebookId] = useState(null);
  const [editedNotebookName, setEditedNotebookName] = useState('');
  const [editingSectionId, setEditingSectionId] = useState(null);
  const [editedSectionTitle, setEditedSectionTitle] = useState('');
  const toggleNotebook = (notebookId) => {
    setExpandedNotebooks(prev =>
      prev.includes(notebookId)
        ? prev.filter(id => id !== notebookId)
        : [...prev, notebookId]
    );
  };

  return (
    <div className="sidebar" style={style}>
      <div className="p-3 border-bottom" style={{ position: 'relative' }}>
        <h5 className="mb-3">
          <i className="bi bi-journal-code me-2"></i>
          NetCodes
        </h5>
        <div className="d-flex gap-2">
          <button
            className="btn btn-sm btn-primary flex-fill"
            onClick={onCreateNotebook}
            title="Create Notebook"
          >
            <i className="bi bi-plus-circle me-1"></i>
            Notebook
          </button>
          <button
            className="btn btn-sm btn-outline-primary flex-fill"
            onClick={onCreateSection}
            title="Create Section"
          >
            <i className="bi bi-plus-circle me-1"></i>
            Section
          </button>
        </div>
        <div className="input-group input-group-sm mt-3">
          <span className="input-group-text"><i className="bi bi-search"></i></span>
          <input
            type="text"
            className="form-control form-control-sm"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyUp={(e) => onSearch(e.target.value)}
          />
          {searchQuery && (
            <button
              className="btn btn-outline-secondary btn-sm"
              type="button"
              onClick={() => { onSearchChange(''); onSearch(''); }}
              title="Effacer la recherche"
            >
              <i className="bi bi-x-lg"></i>
            </button>
          )}
        </div>
        {searchResults.length > 0 && searchQuery && (
          <div className="search-results-overlay">
            {searchResults.map(result => {
              const resultPage = pages.find(p => p.id === result.page_id);
              return resultPage ? (
                <div
                  key={result.page_id}
                  className="search-result-item"
                  onClick={() => onPageSelect(resultPage)}
                >
                  <div className="search-result-header">
                    <span className="fw-bold text-truncate">{result.page_title}</span>
                    <span className="text-muted small">{result.section_title}</span>
                  </div>
                  {result.blocks.slice(0, 2).map((block, idx) => (
                    <div key={idx} className="search-result-block-snippet">
                      {block.block_title && <span className="fw-bold text-truncate">{block.block_title}</span>}
                      <span className="text-muted text-truncate d-block">{block.block_content?.substring(0, 80)}</span>
                    </div>
                  ))}
                </div>
              ) : null;
            })}
          </div>
        )}
      </div>

      <div className="p-2">
        {notebooks.length === 0 ? (
          <div className="text-center text-muted py-4">
            <p className="small">No notebooks yet.</p>
            <p className="small">Click "Notebook" to create one.</p>
          </div>
        ) : (
          notebooks.map(notebook => {
            const notebookSections = sections.filter(s => s.notebook_id === notebook.id);
            const isExpanded = expandedNotebooks.includes(notebook.id);

            return (
              <div key={notebook.id} className="mb-2">
                <div
                  className={`notebook-item overflow-hidden overflow-hidden ${selectedNotebook?.id === notebook.id ? 'active' : ''}`}
                  onClick={() => onNotebookSelect(notebook, true)}
                >
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleNotebook(notebook.id);
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <i className={`bi bi-chevron-${isExpanded ? 'down' : 'right'} me-1`}></i>
                  </span>
                  <span>{notebook.icon}</span>
                  <span className="flex-grow-1 text-truncate">
                    {editingNotebookId === notebook.id ? (
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        value={editedNotebookName}
                        onChange={(e) => setEditedNotebookName(e.target.value)}
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') {
                            onUpdateNotebook(notebook.id, editedNotebookName, notebook.icon);
                            setEditingNotebookId(null);
                          }
                        }}
                        onClick={(e) => e.stopPropagation()} // Prevent notebook selection when editing
                      />
                    ) : (
                      notebook.name
                    )}
                  </span>
                  {editingNotebookId === notebook.id ? (
                    <div className="d-flex gap-1">
                      <button
                        className="btn btn-sm btn-success p-0 px-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          onUpdateNotebook(notebook.id, editedNotebookName, notebook.icon);
                          setEditingNotebookId(null);
                        }}
                        title="Save Notebook Title"
                      >
                        <i className="bi bi-check-lg"></i>
                      </button>
                      <button
                        className="btn btn-sm btn-secondary p-0 px-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditedNotebookName(notebook.name);
                          setEditingNotebookId(null);
                        }}
                        title="Cancel Editing"
                      >
                        <i className="bi bi-x-lg"></i>
                      </button>
                    </div>
                  ) : (
                    <button
                      className="btn btn-sm btn-link text-secondary p-0 px-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditedNotebookName(notebook.name);
                        setEditingNotebookId(notebook.id);
                      }}
                      title="Edit notebook title"
                      style={{ fontSize: '0.85rem' }}
                    >
                      <i className="bi bi-pencil"></i>
                    </button>
                  )}
                  <button
                    className="btn btn-sm btn-link text-danger p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteNotebook(notebook.id);
                    }}
                    title="Delete notebook"
                    style={{ fontSize: '0.85rem' }}
                  >
                    <i className="bi bi-trash"></i>
                  </button>
                </div>

                {isExpanded && notebookSections.map(section => (
                  <div
                    key={section.id}
                    className={`section-item overflow-hidden ${selectedSection?.id === section.id ? 'active' : ''}`}
                    onClick={() => onSectionSelect(section)}
                  >
                    <span
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: section.color,
                        display: 'inline-block'
                      }}
                    ></span>
                    <span className="flex-grow-1 text-truncate overflow-hidden">
                      {editingSectionId === section.id ? (
                        <input
                          type="text"
                          className="form-control form-control-sm"
                          value={editedSectionTitle}
                          onChange={(e) => setEditedSectionTitle(e.target.value)}
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                              onUpdateSection(section.id, editedSectionTitle, section.color);
                              setEditingSectionId(null);
                            }
                          }}
                          onClick={(e) => e.stopPropagation()} // Prevent section selection when editing
                        />
                      ) : (
                        section.title
                      )}
                    </span>
                    {editingSectionId === section.id ? (
                      <div className="d-flex gap-1">
                        <button
                          className="btn btn-sm btn-success p-0 px-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdateSection(section.id, editedSectionTitle, section.color);
                            setEditingSectionId(null);
                          }}
                          title="Save Section Title"
                        >
                          <i className="bi bi-check-lg"></i>
                        </button>
                        <button
                          className="btn btn-sm btn-secondary p-0 px-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditedSectionTitle(section.title);
                            setEditingSectionId(null);
                          }}
                          title="Cancel Editing"
                        >
                          <i className="bi bi-x-lg"></i>
                        </button>
                      </div>
                    ) : (
                      <button
                        className="btn btn-sm btn-link text-secondary p-0 px-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditedSectionTitle(section.title);
                          setEditingSectionId(section.id);
                        }}
                        title="Edit section title"
                        style={{ fontSize: '0.75rem' }}
                      >
                        <i className="bi bi-pencil"></i>
                      </button>
                    )}
                    <button
                      className="btn btn-sm btn-link text-danger p-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSection(section.id);
                      }}
                      title="Delete section"
                      style={{ fontSize: '0.75rem' }}
                    >
                      <i className="bi bi-trash"></i>
                    </button>
                  </div>
                ))}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default Sidebar;
