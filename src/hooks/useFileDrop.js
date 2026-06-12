// src/hooks/useFileDrop.js
import { useState, useCallback } from 'react';

const EXT_TO_LANGUAGE = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', mts: 'typescript',
  py: 'python', pyw: 'python',
  java: 'java',
  cs: 'csharp',
  cpp: 'cpp', cc: 'cpp', cxx: 'cpp', 'c++': 'cpp',
  c: 'c',
  go: 'go',
  rs: 'rust',
  php: 'php',
  rb: 'ruby',
  swift: 'swift',
  kt: 'kotlin', kts: 'kotlin',
  html: 'html', htm: 'html',
  css: 'css',
  scss: 'scss',
  json: 'json', jsonc: 'json',
  yaml: 'yaml', yml: 'yaml',
  xml: 'xml', svg: 'xml',
  sql: 'sql',
  md: 'markdown', markdown: 'markdown',
  sh: 'shell', bash: 'shell', zsh: 'shell',
};

export function detectLanguage(filename) {
  const parts = filename.split('.');
  if (parts.length < 2) return 'plaintext';
  const ext = parts.pop().toLowerCase();
  return EXT_TO_LANGUAGE[ext] || 'plaintext';
}

function isBinary(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0x00) return true;
  }
  return false;
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error('Lecture du fichier échouée'));
    reader.readAsText(file);
  });
}

function readFileSlice(file, bytes) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error('Lecture échouée'));
    reader.readAsArrayBuffer(file.slice(0, bytes));
  });
}

export function useFileDrop(onFileContent) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFileInput = useCallback(async (file) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('Ce fichier est trop volumineux (max 5 Mo).');
      return;
    }
    try {
      const slice = await readFileSlice(file, 512);
      if (isBinary(slice)) {
        alert('Ce fichier est binaire et ne peut pas être chargé.');
        return;
      }
      const content = await readFileAsText(file);
      onFileContent(content, file.name);
    } catch (err) {
      console.error('Erreur lecture fichier:', err);
      alert('Impossible de lire ce fichier.');
    }
  }, [onFileContent]);

  const dragProps = {
    onDragOver: (e) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(true);
    },
    onDragLeave: (e) => {
      e.preventDefault();
      setIsDragOver(false);
    },
    onDrop: (e) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFileInput(file);
    },
  };

  return { dragProps, isDragOver, handleFileInput };
}
