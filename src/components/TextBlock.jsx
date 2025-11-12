import React, { useState, useEffect } from 'react';
import { marked } from 'marked';

function TextBlock({ block, onUpdate, onDelete }) {
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState(block.content || '');

  // Synchronize local state with block prop changes
  useEffect(() => {
    setContent(block.content || '');
  }, [block.content, block.id]);

  const handleSave = () => {
    onUpdate(block.id, content, null);
    setIsEditing(false);
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
    <div className="block-container">
      <div className="block-header">
        <div className="d-flex align-items-center gap-2">
          <i className="bi bi-file-text"></i>
          <span className="fw-medium">Text Block</span>
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
          className="form-control"
          rows="10"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Write markdown text here..."
        />
      ) : (
        <div
          className="markdown-content"
          dangerouslySetInnerHTML={renderMarkdown(content)}
        />
      )}
    </div>
  );
}

export default TextBlock;
