import React, { useState, useEffect } from 'react';
import { marked } from 'marked';

function TextBlock({ block, onUpdate, onDelete }) {
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState(block.content || '');
  const [editedTitle, setEditedTitle] = useState(block.title || '');

  // Synchronize local state with block prop changes
  useEffect(() => {
    setContent(block.content || '');
    setEditedTitle(block.title || '');
  }, [block.content, block.id, block.title]);

  const handleSave = () => {
    onUpdate(block.id, content, null, editedTitle);
    setIsEditing(false);
  };

  const handleTitleBlur = () => {
    if (editedTitle !== block.title) {
      onUpdate(block.id, content, null, editedTitle);
    }
  };

  const renderMarkdown = (text) => {
    try {
      return { __html: marked(text) };
    } catch (error) {
      console.error('Error rendering markdown:', error);
      return { __html: text };
    }
  };

  return (
    <div className="block-container" onBlur={handleSave}>
      <div className="block-header">
        <div className="d-flex align-items-center gap-2 flex-grow-1">
          <i className="reorder bi bi-grip-vertical"></i>
          <input
            type="text"
            className="form-control form-control-sm w-100"
            value={editedTitle}
            onChange={(e) => setEditedTitle(e.target.value)}
            onBlur={handleTitleBlur}
            placeholder="Bloc sans titre"
          />
        </div>
        <div className="block-actions">
          {!isEditing ? (
            <>
              <button
                className="btn btn-sm btn-outline-primary"
                onClick={() => setIsEditing(true)}
                title="Edit"
              >
                <i className="bi bi-pencil"></i>
              </button>
              <button
                className="btn btn-sm btn-outline-danger"
                onClick={() => onDelete(block.id)}
                title="Delete"
              >
                <i className="bi bi-trash"></i>
              </button>
            </>
          ) : (
            <>
              <button
                className="btn btn-sm btn-success"
                onClick={handleSave}
                title="Save"
              >
                <i className="bi bi-check-lg"></i>
              </button>
              <button
                className="btn btn-sm btn-secondary"
                onClick={() => {
                  setIsEditing(false);
                  setContent(block.content);
                }}
                title="Cancel"
              >
                <i className="bi bi-x-lg"></i>
              </button>
            </>
          )}
        </div>
      </div>
      {isEditing ? (
        <textarea
            id="nc-text-area-content"
          className="form-control"
          onBlur={() => {
              handleSave();
              setIsEditing(false);
          }}
          rows="10"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Write markdown text here..."
        />
      ) : (
        <div
          className="markdown-content"
          dangerouslySetInnerHTML={renderMarkdown(content)}
          onClick={() => {
              setIsEditing(true);
              document.getElementById("nc-text-area-content");
          }}
        />
      )}
    </div>
  );
}

export default TextBlock;
