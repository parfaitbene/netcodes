import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useDrag, useDrop } from 'react-dnd';
import { ItemTypes } from '../ItemTypes';

const NOTEBOOK_ICONS = ['📓', '📕', '📗', '📘', '📙', '📔', '📒', '📑', '🗒️', '📝', '✏️', '📋', '📄', '📃', '📰', '📑'];

function IconPickerTrigger({ icon, open, onToggle, onSelect, onClose }) {
  const triggerRef = useRef(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setCoords({ top: rect.bottom + 4, left: rect.left });
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleClick = () => onClose();
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open, onClose]);

  return (
    <span ref={triggerRef} onClick={onToggle} style={{ cursor: 'pointer' }} title="Changer l'icône">
      {icon}
      {open && createPortal(
        <div
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: coords.top,
            left: coords.left,
            backgroundColor: 'white',
            border: '1px solid #ccc',
            borderRadius: '6px',
            padding: '6px',
            zIndex: 9999,
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '4px',
            minWidth: '150px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}
        >
          {NOTEBOOK_ICONS.map(i => (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); onSelect(i); }}
              style={{
                border: 'none',
                background: 'none',
                fontSize: '1.2rem',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '4px',
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f0f0f0'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              {i}
            </button>
          ))}
        </div>,
        document.body
      )}
    </span>
  );
}

function DraggableNotebookItem({
  notebook,
  index,
  moveNotebook,
  selectedNotebook,
  onNotebookSelect,
  onUpdateNotebook,
  onDeleteNotebook,
  onExportNotebook,
  expandedNotebooks,
  toggleNotebook,
  editingNotebookId,
  editedNotebookName,
  setEditedNotebookName,
  setEditingNotebookId,
  showIconPicker,
  setShowIconPicker,
}) {
  const ref = useRef(null);
  const [{ handlerId }, drop] = useDrop({
    accept: ItemTypes.NOTEBOOK,
    collect(monitor) {
      return {
        handlerId: monitor.getHandlerId(),
      };
    },
    hover(item, monitor) {
      if (!ref.current) {
        return;
      }
      const dragIndex = item.index;
      const hoverIndex = index;

      if (dragIndex === hoverIndex) {
        return;
      }

      const hoverBoundingRect = ref.current?.getBoundingClientRect();
      const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;
      const clientOffset = monitor.getClientOffset();
      const hoverClientY = clientOffset.y - hoverBoundingRect.top;

      if (dragIndex < hoverIndex && hoverClientY < hoverMiddleY) {
        return;
      }

      if (dragIndex > hoverIndex && hoverClientY > hoverMiddleY) {
        return;
      }

      moveNotebook(item.id, dragIndex, hoverIndex);
      item.index = hoverIndex;
    },
  });

  const [{ isDragging }, drag] = useDrag({
    type: ItemTypes.NOTEBOOK,
    item: () => ({ id: notebook.id, index }),
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const opacity = isDragging ? 0 : 1;
  drag(drop(ref));

  const isExpanded = expandedNotebooks.includes(notebook.id);

  return (
    <div
      ref={ref}
      style={{ opacity }}
      data-handler-id={handlerId}
      className="mb-2"
    >
      <div
        className={`notebook-item overflow-hidden ${selectedNotebook?.id === notebook.id ? 'active' : ''}`}
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
        <IconPickerTrigger
          icon={notebook.icon}
          open={showIconPicker === notebook.id}
          onToggle={(e) => {
            e.stopPropagation();
            setShowIconPicker(showIconPicker === notebook.id ? null : notebook.id);
          }}
          onSelect={(icon) => {
            onUpdateNotebook(notebook.id, notebook.name, icon);
            setShowIconPicker(null);
          }}
          onClose={() => setShowIconPicker(null)}
        />
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
              onClick={(e) => e.stopPropagation()}
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
          className="btn btn-sm btn-link text-secondary p-0"
          onClick={(e) => { e.stopPropagation(); onExportNotebook(notebook); }}
          title="Exporter (.docx / .md)"
          style={{ fontSize: '0.85rem' }}
        >
          <i className="bi bi-file-earmark-arrow-down"></i>
        </button>
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
    </div>
  );
}

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
  onReorderNotebook,
  onReorderSection,
  onMoveSection,
  onExportNotebook,
  onExportSection,
  onOpenSearch,
  style,
}) {
  const [expandedNotebooks, setExpandedNotebooks] = useState(() => {
    try {
      const stored = localStorage.getItem('expandedNotebooks');
      return stored ? JSON.parse(stored) : notebooks.map(n => n.id);
    } catch {
      return notebooks.map(n => n.id);
    }
  });
  const [editingNotebookId, setEditingNotebookId] = useState(null);
  const [editedNotebookName, setEditedNotebookName] = useState('');
  const [editingSectionId, setEditingSectionId] = useState(null);
  const [editedSectionTitle, setEditedSectionTitle] = useState('');
  const [showIconPicker, setShowIconPicker] = useState(null);
  const [hoveredSectionId, setHoveredSectionId] = useState(null);
  const knownNotebookIdsRef = useRef(new Set(notebooks.map(n => n.id)));

  // Auto-expand notebooks the user just created, without re-expanding
  // notebooks the user had deliberately collapsed in a previous session
  // (those are also "missing" from expandedNotebooks, but aren't new).
  useEffect(() => {
    const currentIds = notebooks.map(n => n.id);
    const newIds = currentIds.filter(id => !knownNotebookIdsRef.current.has(id));
    if (newIds.length > 0) {
      setExpandedNotebooks(prev => [...prev, ...newIds]);
    }
    knownNotebookIdsRef.current = new Set(currentIds);
  }, [notebooks]);

  useEffect(() => {
    if (selectedNotebook) {
      setExpandedNotebooks(prev =>
        prev.includes(selectedNotebook.id) ? prev : [...prev, selectedNotebook.id]
      );
    }
  }, [selectedNotebook?.id]);

  useEffect(() => {
    localStorage.setItem('expandedNotebooks', JSON.stringify(expandedNotebooks));
  }, [expandedNotebooks]);

  const toggleNotebook = (notebookId) => {
    setExpandedNotebooks(prev =>
      prev.includes(notebookId)
        ? prev.filter(id => id !== notebookId)
        : [...prev, notebookId]
    );
  };

  const moveNotebook = async (id, dragIndex, hoverIndex) => {
    const draggedNotebook = notebooks.find(notebook => notebook.id === id);
    if (draggedNotebook) {
      await onReorderNotebook(draggedNotebook.id, hoverIndex);
    }
  };

  return (
    <div className="sidebar" style={style}>
      <div className="sidebar-header p-3 border-bottom" style={{ position: 'relative' }}>
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
          <button
            className="btn btn-sm btn-outline-secondary"
            onClick={onOpenSearch}
            title="Rechercher"
          >
            <i className="bi bi-search"></i>
          </button>
        </div>
      </div>

      <div className="sidebar-body p-2">
        {notebooks.length === 0 ? (
          <div className="text-center text-muted py-4">
            <p className="small">No notebooks yet.</p>
            <p className="small">Click "Notebook" to create one.</p>
          </div>
        ) : (
          notebooks.map((notebook, index) => {
            const notebookSections = sections.filter(s => s.notebook_id === notebook.id);
            const isExpanded = expandedNotebooks.includes(notebook.id);

            return (
              <div key={notebook.id}>
                <DraggableNotebookItem
                  notebook={notebook}
                  index={index}
                  moveNotebook={moveNotebook}
                  selectedNotebook={selectedNotebook}
                  onNotebookSelect={onNotebookSelect}
                  onUpdateNotebook={onUpdateNotebook}
                  onDeleteNotebook={onDeleteNotebook}
                  onExportNotebook={onExportNotebook}
                  expandedNotebooks={expandedNotebooks}
                  toggleNotebook={toggleNotebook}
                  editingNotebookId={editingNotebookId}
                  editedNotebookName={editedNotebookName}
                  setEditedNotebookName={setEditedNotebookName}
                  setEditingNotebookId={setEditingNotebookId}
                  showIconPicker={showIconPicker}
                  setShowIconPicker={setShowIconPicker}
                />

                {isExpanded && notebookSections.map((section, sectionIndex) => (
                  <div
                    key={section.id}
                    className={`section-item overflow-hidden ${selectedSection?.id === section.id ? 'active' : ''}`}
                    onMouseEnter={() => setHoveredSectionId(section.id)}
                    onMouseLeave={() => setHoveredSectionId(null)}
                    onClick={() => onSectionSelect(section)}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '24px', paddingRight: '8px' }}
                  >
                    <div style={{
                      display: 'flex',
                      gap: '2px',
                      opacity: hoveredSectionId === section.id ? 1 : 0,
                      transition: 'opacity 0.2s',
                      minWidth: '48px',
                    }}>
                      <button
                        className="btn btn-sm btn-link text-secondary p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (sectionIndex > 0) {
                            onReorderSection(section.id, sectionIndex - 1);
                          }
                        }}
                        disabled={sectionIndex === 0}
                        title="Move up"
                        style={{
                          fontSize: '0.75rem',
                          cursor: sectionIndex === 0 ? 'not-allowed' : 'pointer',
                          padding: '2px 4px',
                          minWidth: '24px',
                        }}
                      >
                        <i className="bi bi-arrow-up"></i>
                      </button>
                      <button
                        className="btn btn-sm btn-link text-secondary p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (sectionIndex < notebookSections.length - 1) {
                            onReorderSection(section.id, sectionIndex + 1);
                          }
                        }}
                        disabled={sectionIndex === notebookSections.length - 1}
                        title="Move down"
                        style={{
                          fontSize: '0.75rem',
                          cursor: sectionIndex === notebookSections.length - 1 ? 'not-allowed' : 'pointer',
                          padding: '2px 4px',
                          minWidth: '24px',
                        }}
                      >
                        <i className="bi bi-arrow-down"></i>
                      </button>
                    </div>
                    <span
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: section.color,
                        display: 'inline-block',
                        flexShrink: 0,
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
                          onClick={(e) => e.stopPropagation()}
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
                      className="btn btn-sm btn-link text-secondary p-0"
                      onClick={(e) => { e.stopPropagation(); onExportSection(section); }}
                      title="Exporter (.docx / .md)"
                      style={{ fontSize: '0.75rem' }}
                    >
                      <i className="bi bi-file-earmark-arrow-down"></i>
                    </button>
                    <button
                      className="btn btn-sm btn-link text-secondary p-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        onMoveSection(section);
                      }}
                      title="Déplacer vers un autre notebook"
                      style={{ fontSize: '0.75rem' }}
                    >
                      <i className="bi bi-arrow-right-square"></i>
                    </button>
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
