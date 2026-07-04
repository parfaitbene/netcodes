import React, { useRef } from 'react';
import { useDrag, useDrop } from 'react-dnd';
import { ItemTypes } from '../ItemTypes';

function DraggablePageItem({
  page,
  index,
  movePage,
  selectedPage,
  onPageSelect,
  onDeletePage,
  onToggleFavorite,
  onMovePage,
  onExportPage,
}) {
  const ref = useRef(null);

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

  return (
    <div
      ref={ref}
      data-handler-id={handlerId}
      className={`page-item overflow-hidden ${selectedPage?.id === page.id ? 'active' : ''}`}
      style={{ opacity: isDragging ? 0 : 1, cursor: 'grab' }}
      onClick={() => onPageSelect(page)}
    >
      <div className="d-flex justify-content-between align-items-start">
        <div className="d-flex align-items-start gap-2 flex-grow-1 overflow-hidden">
          <div className="overflow-hidden">
            <div className="d-flex align-items-center gap-2">
              <span className="fw-medium overflow-hidden text-truncate">{page.title}</span>
            </div>
            <small className="text-muted d-block mt-1">
              {new Date(page.updated_at).toLocaleDateString()}
            </small>
          </div>
        </div>
        <div className="d-flex gap-1">
          <button
            className="btn btn-sm btn-link text-secondary p-0"
            onClick={(e) => { e.stopPropagation(); onExportPage(page); }}
            title="Exporter (.docx / .md)"
          >
            <i className="bi bi-file-earmark-arrow-down"></i>
          </button>
          <button
            className="btn btn-sm btn-link text-secondary p-0"
            onClick={(e) => { e.stopPropagation(); onMovePage(page); }}
            title="Déplacer vers une autre section"
          >
            <i className="bi bi-arrow-right-square"></i>
          </button>
          <button
            className="btn btn-sm btn-link text-warning p-0"
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(page.id); }}
            title={page.favorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <i className={`bi bi-star${page.favorite ? '-fill' : ''}`}></i>
          </button>
          <button
            className="btn btn-sm btn-link text-danger p-0"
            onClick={(e) => { e.stopPropagation(); onDeletePage(page.id); }}
            title="Delete page"
          >
            <i className="bi bi-trash"></i>
          </button>
        </div>
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
  onToggleFavorite,
  onReorderPage,
  onMovePage,
  onExportPage,
  style,
}) {
  const movePage = async (id, dragIndex, hoverIndex) => {
    const draggedPage = pages.find(p => p.id === id);
    if (draggedPage) {
      await onReorderPage(draggedPage.id, hoverIndex);
    }
  };

  return (
    <div className="pages-list" style={style}>
      <div className="pages-list-header p-3 border-bottom">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h6 className="mb-0">Pages</h6>
          <button
            className="btn btn-sm btn-primary"
            onClick={onCreatePage}
            title="Create new page"
          >
            <i className="bi bi-plus-lg"></i>
          </button>
        </div>
      </div>

      <div className="pages-list-body">
        {pages.length === 0 ? (
          <div className="text-center text-muted py-5">
            <i className="bi bi-file-earmark-text" style={{ fontSize: '3rem', opacity: 0.3 }}></i>
            <p className="small mt-3">No pages in this section.</p>
            <p className="small">Click + to create one.</p>
          </div>
        ) : (
          pages.map((page, index) => (
            <DraggablePageItem
              key={page.id}
              page={page}
              index={index}
              movePage={movePage}
              selectedPage={selectedPage}
              onPageSelect={onPageSelect}
              onDeletePage={onDeletePage}
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
