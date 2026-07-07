import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, BorderStyle, ShadingType,
} from 'docx';
import { marked } from 'marked';
import { dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import { getDatabase } from './database.js';

// ─── Markdown → docx paragraphs ────────────────────────────────────────────

function mdToParagraphs(mdText) {
  if (!mdText) return [];
  const tokens = marked.lexer(mdText);
  const paragraphs = [];

  for (const token of tokens) {
    if (token.type === 'heading') {
      const level = [
        HeadingLevel.HEADING_2,
        HeadingLevel.HEADING_3,
        HeadingLevel.HEADING_4,
        HeadingLevel.HEADING_5,
      ][Math.min(token.depth - 1, 3)];
      paragraphs.push(new Paragraph({ text: token.text.replace(/\*\*|__|\*|_|`/g, ''), heading: level }));
    } else if (token.type === 'paragraph') {
      paragraphs.push(new Paragraph({ children: inlineRuns(token.text) }));
    } else if (token.type === 'list') {
      for (const item of token.items) {
        paragraphs.push(new Paragraph({
          children: inlineRuns(item.text),
          bullet: { level: 0 },
        }));
      }
    } else if (token.type === 'blockquote') {
      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: token.text || '', italics: true, color: '666666' })],
        indent: { left: 720 },
      }));
    } else if (token.type === 'space') {
      paragraphs.push(new Paragraph({ text: '' }));
    } else if (token.type === 'code') {
      for (const line of (token.text || '').split('\n')) {
        paragraphs.push(codeLineParagraph(line));
      }
    }
  }
  return paragraphs.length ? paragraphs : [new Paragraph({ text: '' })];
}

function inlineRuns(text) {
  if (!text) return [new TextRun({ text: '' })];
  const runs = [];
  const regex = /(\*\*|__)(.*?)\1|(\*|_)(.*?)\3|`([^`]+)`|(.*?)(?=\*\*|__|[*_]|`|$)/gs;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (!match[0]) break;
    if (match[1]) runs.push(new TextRun({ text: match[2], bold: true }));
    else if (match[3]) runs.push(new TextRun({ text: match[4], italics: true }));
    else if (match[5]) runs.push(new TextRun({ text: match[5], font: 'Courier New', size: 18 }));
    else if (match[6]) runs.push(new TextRun({ text: match[6] }));
  }
  return runs.length ? runs : [new TextRun({ text })];
}

// ─── Code block paragraph ──────────────────────────────────────────────────

function codeLineParagraph(line) {
  return new Paragraph({
    children: [new TextRun({ text: line || ' ', font: 'Courier New', size: 18 })],
    shading: { type: ShadingType.SOLID, color: 'F3F4F6', fill: 'F3F4F6' },
    border: {
      top:    { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' },
      left:   { style: BorderStyle.SINGLE, size: 4, color: '6B7280' },
      right:  { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' },
    },
    spacing: { before: 0, after: 0 },
  });
}

// ─── Block → paragraphs ────────────────────────────────────────────────────

function blockToParagraphs(block) {
  const parts = [];

  if (block.title) {
    parts.push(new Paragraph({
      children: [new TextRun({ text: block.title, bold: true, size: 22 })],
      spacing: { before: 160, after: 80 },
    }));
  }

  if (block.type === 'code') {
    const lang = block.language ? `[${block.language}]` : '';
    if (lang) {
      parts.push(new Paragraph({
        children: [new TextRun({ text: lang, font: 'Courier New', size: 16, color: '6B7280' })],
        spacing: { before: 0, after: 0 },
      }));
    }
    for (const line of (block.content || '').split('\n')) {
      parts.push(codeLineParagraph(line));
    }
  } else {
    parts.push(...mdToParagraphs(block.content));
  }

  parts.push(new Paragraph({ text: '', spacing: { after: 200 } }));
  return parts;
}

// ─── Page → paragraphs ─────────────────────────────────────────────────────

function pageToParagraphs(page, blocks, level = HeadingLevel.HEADING_1) {
  const db = getDatabase();
  const pageBlocks = blocks ||
    db.prepare('SELECT * FROM blocks WHERE page_id = ? ORDER BY position').all(page.id);

  const parts = [
    new Paragraph({
      text: page.title,
      heading: level,
      spacing: { before: 400, after: 200 },
    }),
  ];

  for (const block of pageBlocks) {
    parts.push(...blockToParagraphs(block));
  }
  return parts;
}

// ─── Block/Page → Markdown ──────────────────────────────────────────────────

function blockToMarkdown(block) {
  let md = '';
  if (block.title) md += `**${block.title}**\n\n`;

  if (block.type === 'code') {
    md += '```' + (block.language || '') + '\n' + (block.content || '') + '\n```\n\n';
  } else {
    md += `${(block.content || '').trim()}\n\n`;
  }
  return md;
}

function pageToMarkdown(page, blocks, level = 1) {
  const db = getDatabase();
  const pageBlocks = blocks ||
    db.prepare('SELECT * FROM blocks WHERE page_id = ? ORDER BY position').all(page.id);

  let md = `${'#'.repeat(level)} ${page.title}\n\n`;
  for (const block of pageBlocks) md += blockToMarkdown(block);
  return md;
}

// ─── Build & save document ─────────────────────────────────────────────────

async function saveDoc(doc, defaultName) {
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: `${defaultName}.docx`,
    filters: [{ name: 'Word Document', extensions: ['docx'] }],
  });
  if (canceled || !filePath) return { saved: false };

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(filePath, buffer);
  return { saved: true, filePath };
}

async function saveMarkdown(content, defaultName) {
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: `${defaultName}.md`,
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  });
  if (canceled || !filePath) return { saved: false };

  fs.writeFileSync(filePath, content, 'utf-8');
  return { saved: true, filePath };
}

function makeDoc(children, title) {
  return new Document({
    title,
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: 24 },
        },
      },
    },
    sections: [{ children }],
  });
}

// ─── Folder-tree export (Notebook > Section > Page > Bloc) ────────────────

function sanitizeName(name) {
  return (name || 'untitled').replace(/[\\/:*?"<>|]/g, '-').trim() || 'untitled';
}

function uniquePath(dir, base, ext = '') {
  let candidate = path.join(dir, `${base}${ext}`);
  let i = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${base} (${i})${ext}`);
    i++;
  }
  return candidate;
}

async function writeBlockFile(destDir, block, index, format) {
  const base = sanitizeName(block.title || `Bloc ${index + 1}`);
  if (format === 'md') {
    const filePath = uniquePath(destDir, base, '.md');
    fs.writeFileSync(filePath, blockToMarkdown(block), 'utf-8');
    return filePath;
  }
  const filePath = uniquePath(destDir, base, '.docx');
  const doc = makeDoc(blockToParagraphs(block), base);
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

async function exportPageIntoDir(destDir, page, format, blockLayout) {
  const db = getDatabase();
  const blocks = db.prepare('SELECT * FROM blocks WHERE page_id = ? ORDER BY position').all(page.id);

  if (blockLayout === 'split') {
    const pageDir = uniquePath(destDir, sanitizeName(page.title));
    fs.mkdirSync(pageDir, { recursive: true });
    for (let i = 0; i < blocks.length; i++) {
      await writeBlockFile(pageDir, blocks[i], i, format);
    }
    return pageDir;
  }

  const base = sanitizeName(page.title);
  if (format === 'md') {
    const filePath = uniquePath(destDir, base, '.md');
    fs.writeFileSync(filePath, pageToMarkdown(page, blocks, 1), 'utf-8');
    return filePath;
  }
  const filePath = uniquePath(destDir, base, '.docx');
  const doc = makeDoc(pageToParagraphs(page, blocks, HeadingLevel.HEADING_1), base);
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

async function exportSectionIntoDir(destDir, section, format, blockLayout) {
  const db = getDatabase();
  const pages = db.prepare('SELECT * FROM pages WHERE section_id = ? ORDER BY position').all(section.id);
  const sectionDir = uniquePath(destDir, sanitizeName(section.title));
  fs.mkdirSync(sectionDir, { recursive: true });
  for (const page of pages) {
    await exportPageIntoDir(sectionDir, page, format, blockLayout);
  }
  return sectionDir;
}

async function exportNotebookIntoDir(destDir, notebook, format, blockLayout) {
  const db = getDatabase();
  const sections = db.prepare('SELECT * FROM sections WHERE notebook_id = ? ORDER BY position').all(notebook.id);
  const notebookDir = uniquePath(destDir, sanitizeName(notebook.name));
  fs.mkdirSync(notebookDir, { recursive: true });
  for (const section of sections) {
    await exportSectionIntoDir(notebookDir, section, format, blockLayout);
  }
  return notebookDir;
}

async function pickDestinationDir() {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
    title: 'Choisir le dossier de destination',
  });
  if (canceled || !filePaths?.[0]) return null;
  return filePaths[0];
}

// ─── Public API ────────────────────────────────────────────────────────────

export const exportOps = {
  // blockLayout: 'merged' (one file per page, blocks merged inside) or
  // 'split' (one file per block, grouped in a folder per page).
  exportPage: async (pageId, format = 'docx', blockLayout = 'merged') => {
    try {
      const db = getDatabase();
      const page = db.prepare('SELECT * FROM pages WHERE id = ?').get(pageId);
      if (!page) return { saved: false, error: 'Page not found' };

      if (blockLayout !== 'split') {
        if (format === 'md') {
          return saveMarkdown(pageToMarkdown(page, null, 1), page.title);
        }
        const doc = makeDoc(pageToParagraphs(page, null, HeadingLevel.HEADING_1), page.title);
        return saveDoc(doc, page.title);
      }

      const destDir = await pickDestinationDir();
      if (!destDir) return { saved: false };
      const filePath = await exportPageIntoDir(destDir, page, format, 'split');
      return { saved: true, filePath };
    } catch (e) {
      console.error('[exportPage] error:', e);
      return { saved: false, error: e.message };
    }
  },

  // Sections always contain multiple pages, so the export always reproduces
  // the Section > Page(> Bloc) folder structure on disk.
  exportSection: async (sectionId, format = 'docx', blockLayout = 'merged') => {
    try {
      const db = getDatabase();
      const section = db.prepare('SELECT * FROM sections WHERE id = ?').get(sectionId);
      if (!section) return { saved: false, error: 'Section not found' };

      const destDir = await pickDestinationDir();
      if (!destDir) return { saved: false };
      const filePath = await exportSectionIntoDir(destDir, section, format, blockLayout);
      return { saved: true, filePath };
    } catch (e) {
      console.error('[exportSection] error:', e);
      return { saved: false, error: e.message };
    }
  },

  // Notebooks always reproduce the full Notebook > Section > Page(> Bloc)
  // folder structure on disk.
  exportNotebook: async (notebookId, format = 'docx', blockLayout = 'merged') => {
    try {
      const db = getDatabase();
      const notebook = db.prepare('SELECT * FROM notebooks WHERE id = ?').get(notebookId);
      if (!notebook) return { saved: false, error: 'Notebook not found' };

      const destDir = await pickDestinationDir();
      if (!destDir) return { saved: false };
      const filePath = await exportNotebookIntoDir(destDir, notebook, format, blockLayout);
      return { saved: true, filePath };
    } catch (e) {
      console.error('[exportNotebook] error:', e);
      return { saved: false, error: e.message };
    }
  },

  exportBlock: async (blockId, format = 'docx') => {
    try {
      const db = getDatabase();
      const block = db.prepare('SELECT * FROM blocks WHERE id = ?').get(blockId);
      if (!block) return { saved: false, error: 'Block not found' };

      const name = block.title || (block.type === 'code' ? 'code-block' : 'text-block');

      if (format === 'md') {
        return saveMarkdown(blockToMarkdown(block), name);
      }
      const doc = makeDoc(blockToParagraphs(block), name);
      return saveDoc(doc, name);
    } catch (e) {
      console.error('[exportBlock] error:', e);
      return { saved: false, error: e.message };
    }
  },
};
