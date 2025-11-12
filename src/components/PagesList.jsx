import React from 'react';

function PagesList({
  pages,
  selectedPage,
  onPageSelect,
  onCreatePage,
  onDeletePage,
  onToggleFavorite,
  style,
}) {
  return (
    <div className="pages-panel" style={style}>
      <div className="p-3 border-bottom">
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

      <div>
        {pages.length === 0 ? (
          <div className="text-center text-muted py-5">
            <i className="bi bi-file-earmark-text" style={{ fontSize: '3rem', opacity: 0.3 }}></i>
            <p className="small mt-3">No pages in this section.</p>
            <p className="small">Click + to create one.</p>
          </div>
        ) : (
          pages.map(page => (
            <div
              key={page.id}
              className={`page-item overflow-hidden ${selectedPage?.id === page.id ? 'active' : ''}`}
              onClick={() => onPageSelect(page)}
            >
              <div className="d-flex justify-content-between align-items-start">
                <div className="flex-grow-1">
                  <div className="d-flex align-items-center gap-2">
                    <span className="fw-medium overflow-hidden">{page.title}</span>
                    {page.favorite === 1 && (
                      <i className="bi bi-star-fill favorite-icon" style={{ fontSize: '0.8rem' }}></i>
                    )}
                  </div>
                  <small className="text-muted d-block mt-1">
                    {new Date(page.updated_at).toLocaleDateString()}
                  </small>
                </div>
                <div className="d-flex gap-1">
                  <button
                    className="btn btn-sm btn-link text-warning p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleFavorite(page.id);
                    }}
                    title={page.favorite ? 'Remove from favorites' : 'Add to favorites'}
                  >
                    <i className={`bi bi-star${page.favorite ? '-fill' : ''}`}></i>
                  </button>
                  <button
                    className="btn btn-sm btn-link text-danger p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeletePage(page.id);
                    }}
                    title="Delete page"
                  >
                    <i className="bi bi-trash"></i>
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default PagesList;
