import React, { useRef, useState } from 'react';
import { useDrag, useDrop } from 'react-dnd';
import { ItemTypes } from '../ItemTypes';
import DropdownMenu from './DropdownMenu';

function DraggablePageItem({
  page,
  index,
  movePage,
  selectedPage,
  onPageSelect,
  onDeletePage,
  onRenamePage,
  onToggleFavorite,
  onMovePage,
  onExportPage,
}) {
  const ref = useRef(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  const [{ handlerId }, drop] = useDrop({
    accept: ItemTypes.PAGE,
    collect(monitor) {
      return { handlerId: monitor.getHandlerId() };
    },
    hover(item, monitor) {
      if (!ref.current) return;
      const dragIndex = item.index;
      const hoverIndex = index;
      if (dragIndex === hoverIndex) return;

      const hoverBoundingRect = ref.current.getBoundingClientRect();
      const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;
      const clientOffset = monitor.getClientOffset();
      const hoverClientY = clientOffset.y - hoverBoundingRect.top;

      if (dragIndex < hoverIndex && hoverClientY < hoverMiddleY) return;
      if (dragIndex > hoverIndex && hoverClientY > hoverMiddleY) return;

      movePage(item.id, dragIndex, hoverIndex);
      item.index = hoverIndex;
    },
  });

  const [{ isDragging }, drag] = useDrag({
    type: ItemTypes.PAGE,
    item: () => ({ id: page.id, index }),
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  });

  drag(drop(ref));

  const handleRenameSubmit = () => {
    if (renameValue.trim() && renameValue.trim() !== page.title) {
      onRenamePage(page.id, renameValue.trim());
    }
    setIsRenaming(false);
  };

  return (
    <div
      ref={ref}
      data-handler-id={handlerId}
      className={`page-item ${selectedPage?.id === page.id ? 'active' : ''}`}
      style={{ opacity: isDragging ? 0 : 1, cursor: 'grab' }}
      onClick={() => !isRenaming && onPageSelect(page)}
    >
      <div className="d-flex justify-content-between align-items-center gap-1">
        <div className="flex-grow-1 overflow-hidden">
          {isRenaming ? (
            <input
              autoFocus
              type="text"
              className="form-control form-control-sm"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRenameSubmit();
                if (e.key === 'Escape') setIsRenaming(false);
              }}
              onBlur={handleRenameSubmit}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <>
              <span className="fw-medium text-truncate d-block">{page.title}</span>
              <small className="text-muted d-block mt-1">
                {new Date(page.updated_at).toLocaleDateString()}
              </small>
            </>
          )}
        </div>
        {!isRenaming && (
          <>
            <button
              className="btn btn-sm btn-link p-0"
              style={{ flexShrink: 0, color: !!page.favorite ? '#ffc107' : '#adb5bd' }}
              onClick={(e) => { e.stopPropagation(); onToggleFavorite(page.id); }}
              title={!!page.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            >
              <i className={`bi bi-star${!!page.favorite ? '-fill' : ''}`}></i>
            </button>
            <DropdownMenu
            items={[
              {
                label: 'Renommer',
                icon: 'bi-pencil',
                onClick: () => { setRenameValue(page.title); setIsRenaming(true); },
              },
              {
                label: page.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris',
                icon: page.favorite ? 'bi-star-fill' : 'bi-star',
                onClick: () => onToggleFavorite(page.id),
              },
              {
                label: 'Déplacer',
                icon: 'bi-arrow-right-square',
                onClick: () => onMovePage(page),
              },
              {
                label: 'Exporter',
                icon: 'bi-file-earmark-arrow-down',
                onClick: () => onExportPage(page),
              },
              { separator: true },
              {
                label: 'Supprimer',
                icon: 'bi-trash',
                danger: true,
                onClick: () => onDeletePage(page.id),
              },
            ]}
          />
          </>
        )}
      </div>
    </div>
  );
}

function PagesList({
  pages,
  selectedPage,
  onPageSelect,
  onCreatePage,
  onDeletePage,
  onRenamePage,
  onToggleFavorite,
  onReorderPage,
  onMovePage,
  onExportPage,
  style,
}) {
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  const movePage = async (id, dragIndex, hoverIndex) => {
    const draggedPage = pages.find(p => p.id === id);
    if (draggedPage) {
      await onReorderPage(draggedPage.id, hoverIndex);
    }
  };

  const visiblePages = favoritesOnly ? pages.filter(p => p.favorite) : pages;

  return (
    <div className="pages-list" style={style}>
      <div className="pages-list-header p-3 border-bottom">
        <div className="d-flex justify-content-between align-items-center mb-2">
          <h6 className="mb-0">Pages</h6>
          <button
            className="btn btn-sm btn-primary"
            onClick={onCreatePage}
            title="Créer une page"
          >
            <i className="bi bi-plus-lg"></i>
          </button>
        </div>
        <button
          className={`btn btn-sm w-100 ${favoritesOnly ? 'btn-warning' : 'btn-outline-secondary'}`}
          onClick={() => setFavoritesOnly(prev => !prev)}
          title={favoritesOnly ? 'Afficher toutes les pages' : 'Afficher uniquement les favoris'}
        >
          <i className={`bi bi-star${favoritesOnly ? '-fill' : ''} me-1`}></i>
          {favoritesOnly ? 'Favoris uniquement' : 'Tous'}
        </button>
      </div>

      <div className="pages-list-body">
        {visiblePages.length === 0 ? (
          <div className="text-center text-muted py-5">
            <i className="bi bi-file-earmark-text" style={{ fontSize: '3rem', opacity: 0.3 }}></i>
            <p className="small mt-3">{favoritesOnly ? 'Aucun favori dans cette section.' : 'Aucune page dans cette section.'}</p>
            {!favoritesOnly && <p className="small">Cliquez sur + pour en créer une.</p>}
          </div>
        ) : (
          visiblePages.map((page, index) => (
            <DraggablePageItem
              key={page.id}
              page={page}
              index={index}
              movePage={movePage}
              selectedPage={selectedPage}
              onPageSelect={onPageSelect}
              onDeletePage={onDeletePage}
              onRenamePage={onRenamePage}
              onToggleFavorite={onToggleFavorite}
              onMovePage={onMovePage}
              onExportPage={onExportPage}
            />
          ))
        )}
      </div>
    </div>
  );
}

export default PagesList;
