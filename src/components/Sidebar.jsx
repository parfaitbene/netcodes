import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useDrag, useDrop } from 'react-dnd';
import { ItemTypes } from '../ItemTypes';
import DropdownMenu from './DropdownMenu';

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
  notebookCount,
  moveNotebook,
  onReorderNotebook,
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
        className={`notebook-item ${selectedNotebook?.id === notebook.id ? 'active' : ''}`}
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
              title="Enregistrer"
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
              title="Annuler"
            >
              <i className="bi bi-x-lg"></i>
            </button>
          </div>
        ) : (
          <DropdownMenu
            items={[
              {
                label: 'Renommer',
                icon: 'bi-pencil',
                onClick: () => {
                  setEditedNotebookName(notebook.name);
                  setEditingNotebookId(notebook.id);
                },
              },
              {
                label: 'Exporter',
                icon: 'bi-file-earmark-arrow-down',
                onClick: () => onExportNotebook(notebook),
              },
              { separator: true },
              {
                label: 'Monter',
                icon: 'bi-arrow-up',
                disabled: index === 0,
                onClick: () => onReorderNotebook(notebook.id, index - 1),
              },
              {
                label: 'En tête de liste',
                icon: 'bi-chevron-double-up',
                disabled: index === 0,
                onClick: () => onReorderNotebook(notebook.id, 0),
              },
              {
                label: 'Descendre',
                icon: 'bi-arrow-down',
                disabled: index === notebookCount - 1,
                onClick: () => onReorderNotebook(notebook.id, index + 1),
              },
              {
                label: 'En fin de liste',
                icon: 'bi-chevron-double-down',
                disabled: index === notebookCount - 1,
                onClick: () => onReorderNotebook(notebook.id, notebookCount - 1),
              },
              { separator: true },
              {
                label: 'Supprimer',
                icon: 'bi-trash',
                danger: true,
                onClick: () => onDeleteNotebook(notebook.id),
              },
            ]}
          />
        )}
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
                  notebookCount={notebooks.length}
                  moveNotebook={moveNotebook}
                  onReorderNotebook={onReorderNotebook}
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
                    className={`section-item ${selectedSection?.id === section.id ? 'active' : ''}`}
                    onClick={() => onSectionSelect(section)}
                    onMouseEnter={() => setHoveredSectionId(section.id)}
                    onMouseLeave={() => setHoveredSectionId(null)}
                    style={{ justifyContent: 'space-between' }}
                  >
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
                    <span style={{ flexGrow: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
                    <div style={{
                      overflow: 'hidden',
                      flexShrink: 0,
                      opacity: hoveredSectionId === section.id || editingSectionId === section.id ? 1 : 0,
                      width: hoveredSectionId === section.id || editingSectionId === section.id ? '48px' : '0px',
                      transition: 'opacity 0.25s, width 0.25s',
                    }}>
                      {editingSectionId === section.id ? (
                        <div className="d-flex gap-1">
                          <button
                            className="btn btn-sm btn-success p-0 px-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              onUpdateSection(section.id, editedSectionTitle, section.color);
                              setEditingSectionId(null);
                            }}
                            title="Enregistrer"
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
                            title="Annuler"
                          >
                            <i className="bi bi-x-lg"></i>
                          </button>
                        </div>
                      ) : (
                        <DropdownMenu
                          items={[
                            {
                              label: 'Renommer',
                              icon: 'bi-pencil',
                              onClick: () => {
                                setEditedSectionTitle(section.title);
                                setEditingSectionId(section.id);
                              },
                            },
                            {
                              label: 'Déplacer',
                              icon: 'bi-arrow-right-square',
                              onClick: () => onMoveSection(section),
                            },
                            {
                              label: 'Exporter',
                              icon: 'bi-file-earmark-arrow-down',
                              onClick: () => onExportSection(section),
                            },
                            { separator: true },
                            {
                              label: 'Monter',
                              icon: 'bi-arrow-up',
                              disabled: sectionIndex === 0,
                              onClick: () => onReorderSection(section.id, sectionIndex - 1),
                            },
                            {
                              label: 'En tête de liste',
                              icon: 'bi-chevron-double-up',
                              disabled: sectionIndex === 0,
                              onClick: () => onReorderSection(section.id, 0),
                            },
                            {
                              label: 'Descendre',
                              icon: 'bi-arrow-down',
                              disabled: sectionIndex === notebookSections.length - 1,
                              onClick: () => onReorderSection(section.id, sectionIndex + 1),
                            },
                            {
                              label: 'En fin de liste',
                              icon: 'bi-chevron-double-down',
                              disabled: sectionIndex === notebookSections.length - 1,
                              onClick: () => onReorderSection(section.id, notebookSections.length - 1),
                            },
                            { separator: true },
                            {
                              label: 'Supprimer',
                              icon: 'bi-trash',
                              danger: true,
                              onClick: () => onDeleteSection(section.id),
                            },
                          ]}
                        />
                      )}
                    </div>
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
