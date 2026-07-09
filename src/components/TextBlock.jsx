// src/components/TextBlock.jsx
import React, { useState, useEffect, useRef } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { useFileDrop } from '../hooks/useFileDrop';
import FileDropModal from './FileDropModal';

function TextBlock({ block, onUpdate, onDelete, onExport, dragHandleRef }) {
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState(block.content || '');
  const [editedTitle, setEditedTitle] = useState(block.title || '');
  const [dropPending, setDropPending] = useState(null);
  const fileInputRef = useRef(null);

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

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      alert('Text copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  const onFileContent = (newContent, filename) => {
    if (content === '') {
      setContent(newContent);
      onUpdate(block.id, newContent, null, editedTitle);
    } else {
      setDropPending({ content: newContent, filename });
    }
  };

  const { dragProps, isDragOver, handleFileInput } = useFileDrop(onFileContent);

  const handleReplace = () => {
    const newContent = dropPending.content;
    setContent(newContent);
    onUpdate(block.id, newContent, null, editedTitle);
    setDropPending(null);
  };

  const handleAppend = () => {
    const newContent = content + '\n' + dropPending.content;
    setContent(newContent);
    onUpdate(block.id, newContent, null, editedTitle);
    setDropPending(null);
  };

  const renderMarkdown = (text) => {
    try {
      return { __html: DOMPurify.sanitize(marked(text)) };
    } catch (error) {
      console.error('Error rendering markdown:', error);
      return { __html: DOMPurify.sanitize(text) };
    }
  };

  return (
    <div
      className={`block-container${isDragOver ? ' drag-over' : ''}`}
      {...dragProps}
    >
      <div className="block-header">
        <div className="d-flex align-items-center gap-2 flex-grow-1">
          <i ref={dragHandleRef} className="reorder bi bi-grip-vertical"></i>
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
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            onChange={(e) => handleFileInput(e.target.files[0])}
          />
          <button
            className="btn btn-sm btn-outline-secondary"
            onClick={() => fileInputRef.current.click()}
            title="Importer un fichier"
          >
            <i className="bi bi-upload"></i>
          </button>
          <button
            className="btn btn-sm btn-outline-secondary"
            onClick={handleCopy}
            title="Copy to clipboard"
          >
            <i className="bi bi-clipboard"></i>
          </button>
          <button
            className="btn btn-sm btn-outline-secondary"
            onClick={onExport}
            title="Exporter (.docx / .md)"
          >
            <i className="bi bi-file-earmark-arrow-down"></i>
          </button>
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
                onMouseDown={(e) => e.preventDefault()}
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
      <FileDropModal
        show={dropPending !== null}
        filename={dropPending?.filename || ''}
        onReplace={handleReplace}
        onAppend={handleAppend}
        onCancel={() => setDropPending(null)}
      />
    </div>
  );
}

export default TextBlock;
