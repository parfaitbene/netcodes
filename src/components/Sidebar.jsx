import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useDrag, useDrop } from 'react-dnd';
import { ItemTypes } from '../ItemTypes';
import DropdownMenu from './DropdownMenu';

const NOTEBOOK_ICONS = ['📓', '📕', '📗', '📘', '📙', '📔', '📒', '📑', '🗒️', '📝', '✏️', '📋', '📄', '📃', '📰', '📑'];

const CONN_ICONS = { sqlite: 'bi-file-earmark-binary', mysql: 'bi-database', postgres: 'bi-database-fill' };
const CONN_STATE_COLORS = { connected: '#28a745', connecting: '#ffc107', error: '#dc3545', closed: '#6c757d' };

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

// Row ids are unique only WITHIN a connection (two databases can both have a
// notebook `id: 1`), so every piece of local UI state that keys off a
// notebook — expansion, editing, icon picker — must key off the composite
// `${connId}:${id}`, never the bare id alone.
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
  const notebookKey = `${notebook.connId}:${notebook.id}`;

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
      // Reordering is strictly intra-connection: a notebook dragged out of
      // one connection's group must never react to hovering over another
      // connection's rows (their `index` values are unrelated).
      if (item.connId !== notebook.connId) {
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

      moveNotebook(item.id, item.connId, dragIndex, hoverIndex);
      item.index = hoverIndex;
    },
  });

  const [{ isDragging }, drag] = useDrag({
    type: ItemTypes.NOTEBOOK,
    item: () => ({ id: notebook.id, connId: notebook.connId, index }),
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const opacity = isDragging ? 0 : 1;
  drag(drop(ref));

  const isExpanded = expandedNotebooks.includes(notebookKey);
  const isActive = selectedNotebook?.connId === notebook.connId && selectedNotebook?.id === notebook.id;

  return (
    <div
      ref={ref}
      style={{ opacity }}
      data-handler-id={handlerId}
      className="mb-2"
    >
      <div
        className={`notebook-item ${isActive ? 'active' : ''}`}
        onClick={() => onNotebookSelect(notebook, true)}
      >
        <span
          onClick={(e) => {
            e.stopPropagation();
            toggleNotebook(notebookKey);
          }}
          style={{ cursor: 'pointer' }}
        >
          <i className={`bi bi-chevron-${isExpanded ? 'down' : 'right'} me-1`}></i>
        </span>
        <IconPickerTrigger
          icon={notebook.icon}
          open={showIconPicker === notebookKey}
          onToggle={(e) => {
            e.stopPropagation();
            setShowIconPicker(showIconPicker === notebookKey ? null : notebookKey);
          }}
          onSelect={(icon) => {
            onUpdateNotebook(notebook.connId, notebook.id, notebook.name, icon);
            setShowIconPicker(null);
          }}
          onClose={() => setShowIconPicker(null)}
        />
        <span className="flex-grow-1 text-truncate">
          {editingNotebookId === notebookKey ? (
            <input
              type="text"
              className="form-control form-control-sm"
              value={editedNotebookName}
              onChange={(e) => setEditedNotebookName(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  onUpdateNotebook(notebook.connId, notebook.id, editedNotebookName, notebook.icon);
                  setEditingNotebookId(null);
                }
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            notebook.name
          )}
        </span>
        {editingNotebookId === notebookKey ? (
          <div className="d-flex gap-1">
            <button
              className="btn btn-sm btn-success p-0 px-1"
              onClick={(e) => {
                e.stopPropagation();
                onUpdateNotebook(notebook.connId, notebook.id, editedNotebookName, notebook.icon);
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
                  setEditingNotebookId(notebookKey);
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
                onClick: () => onReorderNotebook(notebook.connId, notebook.id, index - 1),
              },
              {
                label: 'En tête de liste',
                icon: 'bi-chevron-double-up',
                disabled: index === 0,
                onClick: () => onReorderNotebook(notebook.connId, notebook.id, 0),
              },
              {
                label: 'Descendre',
                icon: 'bi-arrow-down',
                disabled: index === notebookCount - 1,
                onClick: () => onReorderNotebook(notebook.connId, notebook.id, index + 1),
              },
              {
                label: 'En fin de liste',
                icon: 'bi-chevron-double-down',
                disabled: index === notebookCount - 1,
                onClick: () => onReorderNotebook(notebook.connId, notebook.id, notebookCount - 1),
              },
              { separator: true },
              {
                label: 'Supprimer',
                icon: 'bi-trash',
                danger: true,
                onClick: () => onDeleteNotebook(notebook.connId, notebook.id),
              },
            ]}
          />
        )}
      </div>
    </div>
  );
}

function ConnectionGroup({ conn, isCollapsed, onToggle, onCreateNotebook, onReconnect, hasNotebooks, children }) {
  const state = conn.status?.state ?? 'closed';
  return (
    <div className="connection-group mb-2">
      <div
        className="d-flex align-items-center gap-2 px-2 py-1 fw-semibold"
        style={{ cursor: 'pointer', fontSize: '0.85rem', opacity: state === 'connected' ? 1 : 0.6 }}
        onClick={onToggle}
        title={state === 'error' ? conn.status.error : conn.name}
      >
        <i className={`bi ${isCollapsed ? 'bi-chevron-right' : 'bi-chevron-down'}`} style={{ fontSize: '0.7rem' }}></i>
        <i className={`bi ${CONN_ICONS[conn.type] ?? 'bi-database'}`}></i>
        <span className="flex-grow-1 text-truncate">{conn.name}</span>
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          backgroundColor: CONN_STATE_COLORS[state] ?? '#6c757d',
        }}></span>
        {state === 'connected' && (
          <button
            className="btn btn-sm btn-link p-0"
            title="Nouveau notebook dans cette base"
            onClick={(e) => { e.stopPropagation(); onCreateNotebook(conn.id); }}
          >
            <i className="bi bi-plus-circle"></i>
          </button>
        )}
        {(state === 'error' || state === 'closed') && (
          <button
            className={`btn btn-sm btn-link p-0 ${state === 'error' ? 'text-danger' : 'text-secondary'}`}
            title={state === 'error' ? `Reconnecter — ${conn.status.error}` : 'Reconnecter'}
            onClick={(e) => { e.stopPropagation(); onReconnect(conn.id); }}
          >
            <i className="bi bi-arrow-clockwise"></i>
          </button>
        )}
      </div>
      {!isCollapsed && state === 'connected' && (
        <div className="ps-2">
          {hasNotebooks ? children : (
            <div className="text-center text-muted py-2">
              <p className="small mb-0">Aucun notebook dans cette base.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Sidebar({
  notebooks,
  sections,
  connections = [],
  selectedNotebook,
  selectedSection,
  onNotebookSelect,
  onSectionSelect,
  onCreateNotebook,
  onNotebookCreateInConnection,
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
  // Keyed on `${connId}:${id}` throughout — see comment above
  // DraggableNotebookItem for why a bare notebook id is not safe here.
  const [expandedNotebooks, setExpandedNotebooks] = useState(() => {
    const defaultExpanded = () => notebooks.map(n => `${n.connId}:${n.id}`);
    try {
      const stored = localStorage.getItem('expandedNotebooks');
      if (!stored) return defaultExpanded();
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) return defaultExpanded();
      // Pre-2.0 versions stored bare notebook ids (e.g. `[1, 2, 5]`), which
      // can never match the `${connId}:${id}` keys used since the
      // multi-database release — adopting them verbatim would silently
      // leave every notebook collapsed forever. Keep only entries that
      // actually look like a composite key, and fall back to the fresh
      // default (everything expanded) if nothing survives.
      const composite = parsed.filter(key => typeof key === 'string' && /^[^:]+:\d+$/.test(key));
      return composite.length > 0 ? composite : defaultExpanded();
    } catch {
      return defaultExpanded();
    }
  });
  const [editingNotebookId, setEditingNotebookId] = useState(null);
  const [editedNotebookName, setEditedNotebookName] = useState('');
  const [editingSectionId, setEditingSectionId] = useState(null);
  const [editedSectionTitle, setEditedSectionTitle] = useState('');
  const [showIconPicker, setShowIconPicker] = useState(null);
  const [hoveredSectionId, setHoveredSectionId] = useState(null);
  const [collapsedConns, setCollapsedConns] = useState(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem('collapsedConnections'));
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  });
  const knownNotebookIdsRef = useRef(new Set(notebooks.map(n => `${n.connId}:${n.id}`)));

  // Auto-expand notebooks the user just created, without re-expanding
  // notebooks the user had deliberately collapsed in a previous session
  // (those are also "missing" from expandedNotebooks, but aren't new).
  useEffect(() => {
    const currentKeys = notebooks.map(n => `${n.connId}:${n.id}`);
    const newKeys = currentKeys.filter(key => !knownNotebookIdsRef.current.has(key));
    if (newKeys.length > 0) {
      setExpandedNotebooks(prev => [...prev, ...newKeys]);
    }
    knownNotebookIdsRef.current = new Set(currentKeys);
  }, [notebooks]);

  useEffect(() => {
    if (selectedNotebook) {
      const key = `${selectedNotebook.connId}:${selectedNotebook.id}`;
      setExpandedNotebooks(prev => prev.includes(key) ? prev : [...prev, key]);
    }
  }, [selectedNotebook?.connId, selectedNotebook?.id]);

  useEffect(() => {
    localStorage.setItem('expandedNotebooks', JSON.stringify(expandedNotebooks));
  }, [expandedNotebooks]);

  useEffect(() => {
    localStorage.setItem('collapsedConnections', JSON.stringify(collapsedConns));
  }, [collapsedConns]);

  // Drop collapsed-state entries for connections that have since been
  // deleted, so the persisted array doesn't grow forever. Guarded on a
  // non-empty `connections` list: on mount `App` starts with `connections =
  // []` and fills it in asynchronously, so pruning against an empty list
  // here would wipe every persisted collapse state before it even has a
  // chance to load.
  useEffect(() => {
    if (connections.length === 0) return;
    const validIds = new Set(connections.map(c => c.id));
    setCollapsedConns(prev => {
      const pruned = prev.filter(id => validIds.has(id));
      return pruned.length === prev.length ? prev : pruned;
    });
  }, [connections]);

  const toggleNotebook = (notebookKey) => {
    setExpandedNotebooks(prev =>
      prev.includes(notebookKey)
        ? prev.filter(key => key !== notebookKey)
        : [...prev, notebookKey]
    );
  };

  const moveNotebook = async (id, connId, dragIndex, hoverIndex) => {
    const connNotebooks = notebooks.filter(n => n.connId === connId);
    const draggedNotebook = connNotebooks.find(notebook => notebook.id === id);
    if (draggedNotebook) {
      await onReorderNotebook(connId, draggedNotebook.id, hoverIndex);
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
        {connections.length === 0 ? (
          <div className="text-center text-muted py-4">
            <p className="small">Aucune connexion configurée.</p>
            <p className="small">Ouvrez « Paramètres → Connexions aux bases de données... » pour en ajouter une.</p>
          </div>
        ) : (
          connections.map(conn => {
            const connNotebooks = notebooks.filter(n => n.connId === conn.id);
            return (
              <ConnectionGroup
                key={conn.id}
                conn={conn}
                isCollapsed={collapsedConns.includes(conn.id)}
                onToggle={() => setCollapsedConns(prev =>
                  prev.includes(conn.id) ? prev.filter(id => id !== conn.id) : [...prev, conn.id])}
                onCreateNotebook={onNotebookCreateInConnection}
                onReconnect={(id) => window.api.connections.reconnect(id)}
                hasNotebooks={connNotebooks.length > 0}
              >
                {connNotebooks.map((notebook, index) => {
                  const notebookKey = `${notebook.connId}:${notebook.id}`;
                  const notebookSections = sections.filter(s => s.connId === notebook.connId && s.notebook_id === notebook.id);
                  const isExpanded = expandedNotebooks.includes(notebookKey);

                  return (
                    <div key={notebookKey}>
                      <DraggableNotebookItem
                        notebook={notebook}
                        index={index}
                        notebookCount={connNotebooks.length}
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

                      {isExpanded && notebookSections.map((section, sectionIndex) => {
                        const sectionKey = `${section.connId}:${section.id}`;
                        const isSectionActive = selectedSection?.connId === section.connId && selectedSection?.id === section.id;
                        const isEditingSection = editingSectionId === sectionKey;
                        const isHoveredSection = hoveredSectionId === sectionKey;

                        return (
                          <div
                            key={sectionKey}
                            className={`section-item ${isSectionActive ? 'active' : ''}`}
                            onClick={() => onSectionSelect(section)}
                            onMouseEnter={() => setHoveredSectionId(sectionKey)}
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
                              {isEditingSection ? (
                                <input
                                  type="text"
                                  className="form-control form-control-sm"
                                  value={editedSectionTitle}
                                  onChange={(e) => setEditedSectionTitle(e.target.value)}
                                  onKeyPress={(e) => {
                                    if (e.key === 'Enter') {
                                      onUpdateSection(section.connId, section.id, editedSectionTitle, section.color);
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
                              opacity: isHoveredSection || isEditingSection ? 1 : 0,
                              width: isHoveredSection || isEditingSection ? '48px' : '0px',
                              transition: 'opacity 0.25s, width 0.25s',
                            }}>
                              {isEditingSection ? (
                                <div className="d-flex gap-1">
                                  <button
                                    className="btn btn-sm btn-success p-0 px-1"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onUpdateSection(section.connId, section.id, editedSectionTitle, section.color);
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
                                        setEditingSectionId(sectionKey);
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
                                      onClick: () => onReorderSection(section.connId, section.id, sectionIndex - 1),
                                    },
                                    {
                                      label: 'En tête de liste',
                                      icon: 'bi-chevron-double-up',
                                      disabled: sectionIndex === 0,
                                      onClick: () => onReorderSection(section.connId, section.id, 0),
                                    },
                                    {
                                      label: 'Descendre',
                                      icon: 'bi-arrow-down',
                                      disabled: sectionIndex === notebookSections.length - 1,
                                      onClick: () => onReorderSection(section.connId, section.id, sectionIndex + 1),
                                    },
                                    {
                                      label: 'En fin de liste',
                                      icon: 'bi-chevron-double-down',
                                      disabled: sectionIndex === notebookSections.length - 1,
                                      onClick: () => onReorderSection(section.connId, section.id, notebookSections.length - 1),
                                    },
                                    { separator: true },
                                    {
                                      label: 'Supprimer',
                                      icon: 'bi-trash',
                                      danger: true,
                                      onClick: () => onDeleteSection(section.connId, section.id),
                                    },
                                  ]}
                                />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </ConnectionGroup>
            );
          })
        )}
      </div>
    </div>
  );
}

export default Sidebar;
