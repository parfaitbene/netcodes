import React, { useState, useRef, useEffect } from 'react';
import Editor from '@monaco-editor/react';

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

function CodeBlock({ block, onUpdate, onDelete }) {
  const [isEditing, setIsEditing] = useState(false);
  const [language, setLanguage] = useState(block.language || 'javascript');
  const [code, setCode] = useState(block.content || '');
  const editorRef = useRef(null);

  // Synchronize local state with block prop changes
  useEffect(() => {
    setCode(block.content || '');
    setLanguage(block.language || 'javascript');
  }, [block.content, block.language, block.id]);

  const handleEditorDidMount = (editor) => {
    editorRef.current = editor;
  };

  const handleSave = () => {
    onUpdate(block.id, code, language);
    setIsEditing(false);
  };

  const handleCopy = async () => {
    console.log('Attempting to copy code:', code);
    try {
      await navigator.clipboard.writeText(code);
      alert('Code copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy code:', err);
      alert('Failed to copy code. Please check console for details.');
    }
  };

  const handleLanguageChange = (e) => {
    setLanguage(e.target.value);
  };

  return (
    <div className="block-container">
      <div className="block-header">
        <div className="d-flex align-items-center gap-2">
          <i className="bi bi-code-slash"></i>
          <span className="fw-medium">Code Block</span>
          <select
            className="form-select form-select-sm"
            style={{ width: 'auto' }}
            value={language}
            onChange={handleLanguageChange}
            disabled={!isEditing}
          >
            {LANGUAGES.map(lang => (
              <option key={lang.value} value={lang.value}>
                {lang.label}
              </option>
            ))}
          </select>
        </div>
        <div className="block-actions">
          {!isEditing ? (
            <>
              <button
                className="btn btn-sm btn-outline-secondary"
                onClick={handleCopy}
                title="Copy to clipboard"
              >
                <i className="bi bi-clipboard"></i>
              </button>
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
                  setCode(block.content);
                  setLanguage(block.language || 'javascript');
                }}
                title="Cancel"
              >
                <i className="bi bi-x-lg"></i>
              </button>
            </>
          )}
        </div>
      </div>
      <div className="code-block-wrapper">
        <Editor
          height="300px"
          language={language}
          value={code}
          onChange={(value) => setCode(value || '')}
          onMount={handleEditorDidMount}
          theme="vs-light"
          options={{
            readOnly: !isEditing,
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
    </div>
  );
}

export default CodeBlock;
