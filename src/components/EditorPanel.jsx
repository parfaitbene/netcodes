import React, { useState, useEffect } from 'react';
import CodeBlock from './CodeBlock';
import TextBlock from './TextBlock';

function EditorPanel({ page, blocks, onCreateBlock, onUpdateBlock, onDeleteBlock, onUpdatePageTitle }) {
  const [isTitleEditing, setIsTitleEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(page ? page.title : '');

  useEffect(() => {
    setEditedTitle(page ? page.title : '');
  }, [page]);
  if (!page) {
    return (
      <div className="editor-panel">
        <div className="empty-state">
          <i className="bi bi-file-earmark-text"></i>
          <h4>No page selected</h4>
          <p>Select a page from the list or create a new one to get started.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="editor-panel">
      <div className="p-3 border-bottom bg-light sticky-top">
        <div className="d-flex justify-content-between align-items-center">
          <div className="d-flex align-items-center gap-2">
            {isTitleEditing ? (
              <input
                type="text"
                className="form-control form-control-sm"
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    onUpdatePageTitle(page.id, editedTitle);
                    setIsTitleEditing(false);
                  }
                }}
              />
            ) : (
              <h4 className="mb-0">{page.title}</h4>
            )}
            {!isTitleEditing ? (
              <button
                className="btn btn-sm btn-outline-secondary"
                onClick={() => setIsTitleEditing(true)}
                title="Edit Page Title"
              >
                <i className="bi bi-pencil"></i>
              </button>
            ) : (
              <div className="d-flex gap-2">
                <button
                  className="btn btn-sm btn-success"
                  onClick={() => {
                    onUpdatePageTitle(page.id, editedTitle);
                    setIsTitleEditing(false);
                  }}
                  title="Save Page Title"
                >
                  <i className="bi bi-check-lg"></i>
                </button>
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => {
                    setEditedTitle(page.title);
                    setIsTitleEditing(false);
                  }}
                  title="Cancel Editing"
                >
                  <i className="bi bi-x-lg"></i>
                </button>
              </div>
            )}
          </div>
          <div className="d-flex gap-2">
            <button
              className="btn btn-sm btn-outline-primary"
              onClick={() => onCreateBlock('text')}
              title="Add text block"
            >
              <i className="bi bi-file-text me-1"></i>
              Text
            </button>
            <button
              className="btn btn-sm btn-outline-primary"
              onClick={() => onCreateBlock('code')}
              title="Add code block"
            >
              <i className="bi bi-code-slash me-1"></i>
              Code
            </button>
          </div>
        </div>
        <small className="text-muted">
          Last updated: {new Date(page.updated_at).toLocaleString()}
        </small>
      </div>

      <div className="p-3">
        {blocks.length === 0 ? (
          <div className="empty-state" style={{ height: 'auto', padding: '60px 20px' }}>
            <i className="bi bi-inbox"></i>
            <h5>No blocks yet</h5>
            <p>Add text or code blocks to start building your page.</p>
          </div>
        ) : (
          blocks.map(block => (
            <div key={block.id}>
              {block.type === 'text' ? (
                <TextBlock
                  block={block}
                  onUpdate={onUpdateBlock}
                  onDelete={onDeleteBlock}
                />
              ) : block.type === 'code' ? (
                <CodeBlock
                  block={block}
                  onUpdate={onUpdateBlock}
                  onDelete={onDeleteBlock}
                />
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default EditorPanel;
