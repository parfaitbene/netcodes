// src/components/CodeBlock.jsx
import React, { useState, useRef, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { useFileDrop, detectLanguage } from '../hooks/useFileDrop';
import FileDropModal from './FileDropModal';
import DropdownMenu from './DropdownMenu';

const LANGUAGES = [
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'java', label: 'Java' },
  { value: 'csharp', label: 'C#' },
  { value: 'cpp', label: 'C++' },
  { value: 'c', label: 'C' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'php', label: 'PHP' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'swift', label: 'Swift' },
  { value: 'kotlin', label: 'Kotlin' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'scss', label: 'SCSS' },
  { value: 'json', label: 'JSON' },
  { value: 'yaml', label: 'YAML' },
  { value: 'xml', label: 'XML' },
  { value: 'sql', label: 'SQL' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'shell', label: 'Shell' },
  { value: 'plaintext', label: 'Plain Text' },
];

function CodeBlock({ block, index, blockCount, onUpdate, onDelete, onExport, onReorder, dragHandleRef }) {
  const [language, setLanguage] = useState(block.language || 'javascript');
  const [code, setCode] = useState(block.content || '');
  const [editedTitle, setEditedTitle] = useState(block.title || '');
  const [dropPending, setDropPending] = useState(null);
  const editorRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    setCode(block.content || '');
    setLanguage(block.language || 'javascript');
    setEditedTitle(block.title || '');
  }, [block.content, block.language, block.id, block.title]);

  const handleEditorDidMount = (editor) => {
    editorRef.current = editor;
  };

  const handleSave = () => {
    onUpdate(block.id, code, language, editedTitle);
  };

  const handleTitleBlur = () => {
    if (editedTitle !== block.title) {
      onUpdate(block.id, code, language, editedTitle);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      alert('Code copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy code:', err);
      alert('Failed to copy code. Please check console for details.');
    }
  };

  const handleLanguageChange = (e) => {
    const newLanguage = e.target.value;
    setLanguage(newLanguage);
    onUpdate(block.id, code, newLanguage, editedTitle);
  };

  const onFileContent = (newContent, filename) => {
    const detectedLang = detectLanguage(filename);
    if (code === '') {
      setCode(newContent);
      setLanguage(detectedLang);
      onUpdate(block.id, newContent, detectedLang, editedTitle);
    } else {
      setDropPending({ content: newContent, filename, language: detectedLang });
    }
  };

  const { dragProps, isDragOver, handleFileInput } = useFileDrop(onFileContent);

  const handleReplace = () => {
    const { content: newContent, language: detectedLang } = dropPending;
    setCode(newContent);
    setLanguage(detectedLang);
    onUpdate(block.id, newContent, detectedLang, editedTitle);
    setDropPending(null);
  };

  const handleAppend = () => {
    const { content: newContent, language: detectedLang } = dropPending;
    const merged = code + '\n' + newContent;
    setCode(merged);
    setLanguage(detectedLang);
    onUpdate(block.id, merged, detectedLang, editedTitle);
    setDropPending(null);
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
          <select
            className="form-select form-select-sm mx-2"
            style={{ width: 'auto' }}
            value={language}
            onChange={handleLanguageChange}
          >
            {LANGUAGES.map(lang => (
              <option key={lang.value} value={lang.value}>
                {lang.label}
              </option>
            ))}
          </select>
        </div>
        <div className="block-actions">
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            onChange={(e) => handleFileInput(e.target.files[0])}
          />
          <DropdownMenu
            items={[
              {
                label: 'Copier le code',
                icon: 'bi-clipboard',
                onClick: handleCopy,
              },
              {
                label: 'Importer un fichier',
                icon: 'bi-upload',
                onClick: () => fileInputRef.current.click(),
              },
              {
                label: 'Exporter',
                icon: 'bi-file-earmark-arrow-down',
                onClick: onExport,
              },
              { separator: true },
              {
                label: 'Monter',
                icon: 'bi-arrow-up',
                disabled: index === 0,
                onClick: () => onReorder(block.id, index),
              },
              {
                label: 'En tête de liste',
                icon: 'bi-chevron-double-up',
                disabled: index === 0,
                onClick: () => onReorder(block.id, 1),
              },
              {
                label: 'Descendre',
                icon: 'bi-arrow-down',
                disabled: index === blockCount - 1,
                onClick: () => onReorder(block.id, index + 2),
              },
              {
                label: 'En fin de liste',
                icon: 'bi-chevron-double-down',
                disabled: index === blockCount - 1,
                onClick: () => onReorder(block.id, blockCount),
              },
              { separator: true },
              {
                label: 'Supprimer',
                icon: 'bi-trash',
                danger: true,
                onClick: () => onDelete(block.id),
              },
            ]}
          />
        </div>
      </div>
      <div className="code-block-wrapper" onBlur={handleSave}>
        <Editor
          height="300px"
          language={language}
          value={code}
          onChange={(value) => setCode(value || '')}
          onMount={handleEditorDidMount}
          theme="vs-light"
          options={{
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            fontSize: 14,
            lineNumbers: 'on',
            renderLineHighlight: 'all',
            scrollbar: {
              vertical: 'visible',
              horizontal: 'visible',
            },
          }}
        />
      </div>
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

export default CodeBlock;
