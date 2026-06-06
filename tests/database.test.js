import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb, seedDb } from './helpers/db.js';

// Patch the module-level `db` variable by re-importing ops bound to a test db
// We instantiate ops directly against the test db to avoid Electron dependency.
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function makeOps(db) {
  const notebookOps = {
    getAll: () => db.prepare('SELECT * FROM notebooks ORDER BY position').all(),
    getById: (id) => db.prepare('SELECT * FROM notebooks WHERE id = ?').get(id),
    create: (name, icon = '📓') => {
      const maxPos = db.prepare('SELECT MAX(position) as max FROM notebooks').get();
      const position = (maxPos.max || 0) + 1;
      return db.prepare('INSERT INTO notebooks (name, icon, position) VALUES (?, ?, ?)').run(name, icon, position).lastInsertRowid;
    },
    update: (id, name, icon) => db.prepare('UPDATE notebooks SET name = ?, icon = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(name, icon, id),
    delete: (id) => db.prepare('DELETE FROM notebooks WHERE id = ?').run(id),
    reorder: (id, newPosition) => db.prepare('UPDATE notebooks SET position = ? WHERE id = ?').run(newPosition, id),
  };

  const sectionOps = {
    getAll: () => db.prepare('SELECT * FROM sections ORDER BY notebook_id, position').all(),
    getByNotebook: (nbId) => db.prepare('SELECT * FROM sections WHERE notebook_id = ? ORDER BY position').all(nbId),
    getById: (id) => db.prepare('SELECT * FROM sections WHERE id = ?').get(id),
    create: (notebookId, title, color = '#007bff') => {
      const maxPos = db.prepare('SELECT MAX(position) as max FROM sections WHERE notebook_id = ?').get(notebookId);
      const position = (maxPos.max || 0) + 1;
      return db.prepare('INSERT INTO sections (notebook_id, title, color, position) VALUES (?, ?, ?, ?)').run(notebookId, title, color, position).lastInsertRowid;
    },
    update: (id, title, color) => db.prepare('UPDATE sections SET title = ?, color = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(title, color, id),
    delete: (id) => db.prepare('DELETE FROM sections WHERE id = ?').run(id),
    reorder: (id, pos) => db.prepare('UPDATE sections SET position = ? WHERE id = ?').run(pos, id),
    move: (id, newNotebookId) => {
      const maxPos = db.prepare('SELECT MAX(position) as max FROM sections WHERE notebook_id = ?').get(newNotebookId);
      const position = (maxPos.max || 0) + 1;
      return db.prepare('UPDATE sections SET notebook_id = ?, position = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newNotebookId, position, id);
    },
  };

  const pageOps = {
    getAll: () => db.prepare('SELECT * FROM pages ORDER BY section_id, favorite, position').all(),
    getBySection: (sId) => db.prepare('SELECT * FROM pages WHERE section_id = ? ORDER BY favorite, position').all(sId),
    getById: (id) => db.prepare('SELECT * FROM pages WHERE id = ?').get(id),
    getFavorites: () => db.prepare('SELECT * FROM pages WHERE favorite = 1 ORDER BY updated_at DESC').all(),
    create: (sectionId, title) => {
      const maxPos = db.prepare('SELECT MAX(position) as max FROM pages WHERE section_id = ?').get(sectionId);
      const position = (maxPos.max || 0) + 1;
      return db.prepare('INSERT INTO pages (section_id, title, position) VALUES (?, ?, ?)').run(sectionId, title, position).lastInsertRowid;
    },
    update: (id, title) => db.prepare('UPDATE pages SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(title, id),
    toggleFavorite: (id) => db.prepare('UPDATE pages SET favorite = NOT favorite, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id),
    delete: (id) => db.prepare('DELETE FROM pages WHERE id = ?').run(id),
    reorder: (id, pos) => db.prepare('UPDATE pages SET position = ? WHERE id = ?').run(pos, id),
    move: (id, newSectionId) => {
      const maxPos = db.prepare('SELECT MAX(position) as max FROM pages WHERE section_id = ?').get(newSectionId);
      const position = (maxPos.max || 0) + 1;
      return db.prepare('UPDATE pages SET section_id = ?, position = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newSectionId, position, id);
    },
  };

  const blockOps = {
    getByPage: (pageId) => db.prepare('SELECT * FROM blocks WHERE page_id = ? ORDER BY position').all(pageId),
    getById: (id) => db.prepare('SELECT * FROM blocks WHERE id = ?').get(id),
    create: (pageId, type, content, language = null, filename = null, title = null) => {
      const maxPos = db.prepare('SELECT MAX(position) as max FROM blocks WHERE page_id = ?').get(pageId);
      const position = (maxPos.max || 0) + 1;
      return db.prepare('INSERT INTO blocks (page_id, type, content, language, filename, title, position) VALUES (?, ?, ?, ?, ?, ?, ?)').run(pageId, type, content, language, filename, title, position).lastInsertRowid;
    },
    update: (id, content, language = null, title = null) => db.prepare('UPDATE blocks SET content = ?, language = ?, title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(content, language, title, id),
    delete: (id) => db.prepare('DELETE FROM blocks WHERE id = ?').run(id),
    reorder: (id, pos) => db.prepare('UPDATE blocks SET position = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(pos, id),
  };

  const searchOps = {
    search: (query) => {
      const term = `%${query}%`;
      const notebooks = db.prepare('SELECT id AS notebook_id, name AS notebook_name FROM notebooks WHERE name LIKE ? ORDER BY name').all(term);
      const sections = db.prepare(`
        SELECT s.id AS section_id, s.title AS section_title, n.id AS notebook_id, n.name AS notebook_name
        FROM sections s JOIN notebooks n ON s.notebook_id = n.id WHERE s.title LIKE ? ORDER BY s.title
      `).all(term);
      const pages = db.prepare(`
        SELECT DISTINCT p.id AS page_id, p.title AS page_title, s.id AS section_id, s.title AS section_title,
          n.id AS notebook_id, n.name AS notebook_name, b.id AS block_id, b.title AS block_title, b.content AS block_content
        FROM pages p JOIN sections s ON p.section_id = s.id JOIN notebooks n ON s.notebook_id = n.id
        LEFT JOIN blocks b ON b.page_id = p.id
        WHERE p.title LIKE ? OR b.title LIKE ? OR b.content LIKE ?
        ORDER BY p.updated_at DESC
      `).all(term, term, term);
      return { notebooks, sections, pages };
    },
  };

  return { notebookOps, sectionOps, pageOps, blockOps, searchOps };
}

// ─── Notebooks ──────────────────────────────────────────────────────────────

describe('notebookOps', () => {
  let db, ops, ids;

  beforeEach(() => {
    db = createTestDb();
    ops = makeOps(db);
    ids = seedDb(db);
  });

  it('getAll retourne tous les notebooks triés par position', () => {
    const all = ops.notebookOps.getAll();
    expect(all).toHaveLength(2);
    expect(all[0].name).toBe('Notebook A');
    expect(all[1].name).toBe('Notebook B');
  });

  it('getById retourne le bon notebook', () => {
    const nb = ops.notebookOps.getById(ids.nb1);
    expect(nb.name).toBe('Notebook A');
    expect(nb.icon).toBe('📓');
  });

  it('getById retourne undefined pour un id inexistant', () => {
    expect(ops.notebookOps.getById(9999)).toBeUndefined();
  });

  it('create ajoute un notebook avec position auto-incrémentée', () => {
    const id = ops.notebookOps.create('Notebook C', '📗');
    const nb = ops.notebookOps.getById(id);
    expect(nb.name).toBe('Notebook C');
    expect(nb.icon).toBe('📗');
    expect(nb.position).toBe(3);
  });

  it('create avec icône par défaut', () => {
    const id = ops.notebookOps.create('Sans icône');
    expect(ops.notebookOps.getById(id).icon).toBe('📓');
  });

  it('update modifie le nom et l\'icône', () => {
    ops.notebookOps.update(ids.nb1, 'Renamed', '📕');
    const nb = ops.notebookOps.getById(ids.nb1);
    expect(nb.name).toBe('Renamed');
    expect(nb.icon).toBe('📕');
  });

  it('delete supprime le notebook et ses sections en cascade', () => {
    ops.notebookOps.delete(ids.nb1);
    expect(ops.notebookOps.getById(ids.nb1)).toBeUndefined();
    expect(ops.sectionOps.getByNotebook(ids.nb1)).toHaveLength(0);
  });

  it('reorder met à jour la position', () => {
    ops.notebookOps.reorder(ids.nb1, 5);
    expect(ops.notebookOps.getById(ids.nb1).position).toBe(5);
  });
});

// ─── Sections ───────────────────────────────────────────────────────────────

describe('sectionOps', () => {
  let db, ops, ids;

  beforeEach(() => {
    db = createTestDb();
    ops = makeOps(db);
    ids = seedDb(db);
  });

  it('getAll retourne toutes les sections', () => {
    expect(ops.sectionOps.getAll()).toHaveLength(3);
  });

  it('getByNotebook retourne les sections du bon notebook triées par position', () => {
    const secs = ops.sectionOps.getByNotebook(ids.nb1);
    expect(secs).toHaveLength(2);
    expect(secs[0].title).toBe('Section 1');
    expect(secs[1].title).toBe('Section 2');
  });

  it('getByNotebook retourne [] pour un notebook sans sections', () => {
    const newNb = ops.notebookOps.create('Empty NB');
    expect(ops.sectionOps.getByNotebook(newNb)).toHaveLength(0);
  });

  it('getById retourne la bonne section', () => {
    const sec = ops.sectionOps.getById(ids.sec1);
    expect(sec.title).toBe('Section 1');
    expect(sec.notebook_id).toBe(ids.nb1);
  });

  it('create ajoute avec position auto-incrémentée dans le notebook', () => {
    const id = ops.sectionOps.create(ids.nb1, 'Section 4', '#ff0000');
    const sec = ops.sectionOps.getById(id);
    expect(sec.title).toBe('Section 4');
    expect(sec.position).toBe(3);
    expect(sec.notebook_id).toBe(ids.nb1);
  });

  it('create première section dans un nouveau notebook a position 1', () => {
    const nbId = ops.notebookOps.create('New NB');
    const id = ops.sectionOps.create(nbId, 'First');
    expect(ops.sectionOps.getById(id).position).toBe(1);
  });

  it('update modifie le titre et la couleur', () => {
    ops.sectionOps.update(ids.sec1, 'Updated', '#ffffff');
    const sec = ops.sectionOps.getById(ids.sec1);
    expect(sec.title).toBe('Updated');
    expect(sec.color).toBe('#ffffff');
  });

  it('delete supprime la section et ses pages en cascade', () => {
    ops.sectionOps.delete(ids.sec1);
    expect(ops.sectionOps.getById(ids.sec1)).toBeUndefined();
    expect(ops.pageOps.getBySection(ids.sec1)).toHaveLength(0);
  });

  it('reorder met à jour la position', () => {
    ops.sectionOps.reorder(ids.sec1, 10);
    expect(ops.sectionOps.getById(ids.sec1).position).toBe(10);
  });

  it('move déplace une section vers un autre notebook avec nouvelle position', () => {
    ops.sectionOps.move(ids.sec1, ids.nb2);
    const sec = ops.sectionOps.getById(ids.sec1);
    expect(sec.notebook_id).toBe(ids.nb2);
    expect(sec.position).toBe(2); // sec3 est déjà en position 1 dans nb2
  });

  it('move vers un notebook vide attribue position 1', () => {
    const nbId = ops.notebookOps.create('Empty NB');
    ops.sectionOps.move(ids.sec1, nbId);
    expect(ops.sectionOps.getById(ids.sec1).position).toBe(1);
  });
});

// ─── Pages ──────────────────────────────────────────────────────────────────

describe('pageOps', () => {
  let db, ops, ids;

  beforeEach(() => {
    db = createTestDb();
    ops = makeOps(db);
    ids = seedDb(db);
  });

  it('getAll retourne toutes les pages', () => {
    expect(ops.pageOps.getAll()).toHaveLength(3);
  });

  it('getBySection retourne les pages de la section triées par position', () => {
    const pages = ops.pageOps.getBySection(ids.sec1);
    expect(pages).toHaveLength(2);
    expect(pages[0].title).toBe('Page 1');
    expect(pages[1].title).toBe('Page 2');
  });

  it('getBySection retourne [] pour section vide', () => {
    expect(ops.pageOps.getBySection(ids.sec3)).toHaveLength(0);
  });

  it('getById retourne la bonne page', () => {
    const page = ops.pageOps.getById(ids.p1);
    expect(page.title).toBe('Page 1');
    expect(page.section_id).toBe(ids.sec1);
  });

  it('create ajoute une page avec position auto-incrémentée', () => {
    const id = ops.pageOps.create(ids.sec1, 'Page New');
    const page = ops.pageOps.getById(id);
    expect(page.title).toBe('Page New');
    expect(page.position).toBe(3);
  });

  it('create première page d\'une section a position 1', () => {
    const id = ops.pageOps.create(ids.sec3, 'First Page');
    expect(ops.pageOps.getById(id).position).toBe(1);
  });

  it('update modifie le titre', () => {
    ops.pageOps.update(ids.p1, 'Renamed Page');
    expect(ops.pageOps.getById(ids.p1).title).toBe('Renamed Page');
  });

  it('toggleFavorite active le favori', () => {
    ops.pageOps.toggleFavorite(ids.p1);
    expect(ops.pageOps.getById(ids.p1).favorite).toBe(1);
  });

  it('toggleFavorite désactive le favori si déjà actif', () => {
    ops.pageOps.toggleFavorite(ids.p1);
    ops.pageOps.toggleFavorite(ids.p1);
    expect(ops.pageOps.getById(ids.p1).favorite).toBe(0);
  });

  it('getFavorites retourne seulement les pages favorites', () => {
    ops.pageOps.toggleFavorite(ids.p1);
    ops.pageOps.toggleFavorite(ids.p2);
    const favs = ops.pageOps.getFavorites();
    expect(favs).toHaveLength(2);
    expect(favs.every(p => p.favorite === 1)).toBe(true);
  });

  it('delete supprime la page et ses blocs en cascade', () => {
    ops.pageOps.delete(ids.p1);
    expect(ops.pageOps.getById(ids.p1)).toBeUndefined();
    expect(ops.blockOps.getByPage(ids.p1)).toHaveLength(0);
  });

  it('reorder met à jour la position', () => {
    ops.pageOps.reorder(ids.p1, 99);
    expect(ops.pageOps.getById(ids.p1).position).toBe(99);
  });

  it('move déplace une page vers une autre section', () => {
    ops.pageOps.move(ids.p1, ids.sec2);
    const page = ops.pageOps.getById(ids.p1);
    expect(page.section_id).toBe(ids.sec2);
    expect(page.position).toBe(2); // sec2 a déjà page p3 en position 1
  });

  it('move vers une section vide attribue position 1', () => {
    ops.pageOps.move(ids.p1, ids.sec3);
    expect(ops.pageOps.getById(ids.p1).position).toBe(1);
  });
});

// ─── Blocks ─────────────────────────────────────────────────────────────────

describe('blockOps', () => {
  let db, ops, ids;

  beforeEach(() => {
    db = createTestDb();
    ops = makeOps(db);
    ids = seedDb(db);
  });

  it('getByPage retourne les blocs triés par position', () => {
    const blocks = ops.blockOps.getByPage(ids.p1);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].type).toBe('text');
    expect(blocks[1].type).toBe('code');
  });

  it('getByPage retourne [] pour une page sans blocs', () => {
    expect(ops.blockOps.getByPage(ids.p3)).toHaveLength(0);
  });

  it('getById retourne le bon bloc', () => {
    const block = ops.blockOps.getById(ids.b1);
    expect(block.type).toBe('text');
    expect(block.title).toBe('Intro');
    expect(block.page_id).toBe(ids.p1);
  });

  it('create ajoute un bloc texte avec position auto-incrémentée', () => {
    const id = ops.blockOps.create(ids.p1, 'text', 'New content');
    const block = ops.blockOps.getById(id);
    expect(block.type).toBe('text');
    expect(block.content).toBe('New content');
    expect(block.position).toBe(3);
  });

  it('create ajoute un bloc code avec language', () => {
    const id = ops.blockOps.create(ids.p3, 'code', 'print("hello")', 'python', null, 'My Script');
    const block = ops.blockOps.getById(id);
    expect(block.language).toBe('python');
    expect(block.title).toBe('My Script');
    expect(block.position).toBe(1);
  });

  it('create premier bloc d\'une page a position 1', () => {
    const id = ops.blockOps.create(ids.p3, 'text', 'First');
    expect(ops.blockOps.getById(id).position).toBe(1);
  });

  it('update modifie le contenu, language et titre', () => {
    ops.blockOps.update(ids.b2, 'updated code', 'typescript', 'New Title');
    const block = ops.blockOps.getById(ids.b2);
    expect(block.content).toBe('updated code');
    expect(block.language).toBe('typescript');
    expect(block.title).toBe('New Title');
  });

  it('delete supprime le bloc', () => {
    ops.blockOps.delete(ids.b1);
    expect(ops.blockOps.getById(ids.b1)).toBeUndefined();
    expect(ops.blockOps.getByPage(ids.p1)).toHaveLength(1);
  });

  it('reorder met à jour la position', () => {
    ops.blockOps.reorder(ids.b1, 5);
    expect(ops.blockOps.getById(ids.b1).position).toBe(5);
  });
});

// ─── Search ─────────────────────────────────────────────────────────────────

describe('searchOps', () => {
  let db, ops, ids;

  beforeEach(() => {
    db = createTestDb();
    ops = makeOps(db);
    ids = seedDb(db);
  });

  it('recherche un notebook par nom', () => {
    const results = ops.searchOps.search('Notebook A');
    expect(results.notebooks).toHaveLength(1);
    expect(results.notebooks[0].notebook_name).toBe('Notebook A');
  });

  it('recherche une section par titre', () => {
    const results = ops.searchOps.search('Section 1');
    expect(results.sections).toHaveLength(1);
    expect(results.sections[0].section_title).toBe('Section 1');
  });

  it('recherche une page par titre', () => {
    const results = ops.searchOps.search('Page 1');
    expect(results.pages.length).toBeGreaterThanOrEqual(1);
    expect(results.pages.some(p => p.page_title === 'Page 1')).toBe(true);
  });

  it('recherche dans le contenu d\'un bloc', () => {
    const results = ops.searchOps.search('Hello');
    expect(results.pages.some(p => p.page_id === ids.p1)).toBe(true);
  });

  it('recherche dans le titre d\'un bloc', () => {
    const results = ops.searchOps.search('Snippet');
    expect(results.pages.some(p => p.page_id === ids.p1)).toBe(true);
  });

  it('retourne les 3 catégories vides pour une requête sans résultat', () => {
    const results = ops.searchOps.search('xyznotfound999');
    expect(results.notebooks).toHaveLength(0);
    expect(results.sections).toHaveLength(0);
    expect(results.pages).toHaveLength(0);
  });

  it('recherche partielle fonctionne', () => {
    const results = ops.searchOps.search('Note');
    expect(results.notebooks.length).toBeGreaterThanOrEqual(1);
  });

  it('retourne toutes les correspondances multi-catégories', () => {
    // "Section" apparaît dans les titres de section
    const results = ops.searchOps.search('Section');
    expect(results.sections.length).toBeGreaterThanOrEqual(3);
  });
});

// ─── Export (génération docx) ────────────────────────────────────────────────

describe('export - génération docx', () => {
  let db, ids;

  beforeEach(() => {
    db = createTestDb();
    ids = seedDb(db);
  });

  it('génère un buffer docx non vide pour une page', async () => {
    const { Document, Packer, Paragraph, TextRun, HeadingLevel, BorderStyle, ShadingType } = await import('docx');
    const { marked } = await import('marked');

    function codeLineParagraph(line) {
      return new Paragraph({
        children: [new TextRun({ text: line || ' ', font: 'Courier New', size: 18 })],
        shading: { type: ShadingType.SOLID, color: 'F3F4F6', fill: 'F3F4F6' },
        spacing: { before: 0, after: 0 },
      });
    }

    function blockToParagraphs(block) {
      const parts = [];
      if (block.title) parts.push(new Paragraph({ children: [new TextRun({ text: block.title, bold: true })] }));
      if (block.type === 'code') {
        for (const line of (block.content || '').split('\n')) parts.push(codeLineParagraph(line));
      } else {
        const tokens = marked.lexer(block.content || '');
        for (const t of tokens) {
          if (t.type === 'paragraph' || t.type === 'heading') {
            parts.push(new Paragraph({ text: t.text || '' }));
          }
        }
      }
      return parts;
    }

    const page = db.prepare('SELECT * FROM pages WHERE id = ?').get(ids.p1);
    const blocks = db.prepare('SELECT * FROM blocks WHERE page_id = ? ORDER BY position').all(ids.p1);

    const children = [
      new Paragraph({ text: page.title, heading: HeadingLevel.HEADING_1 }),
      ...blocks.flatMap(b => blockToParagraphs(b)),
    ];

    const doc = new Document({ sections: [{ children }] });
    const buffer = await Packer.toBuffer(doc);

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(1000);
  });

  it('génère un buffer docx non vide pour une section avec plusieurs pages', async () => {
    const { Document, Packer, Paragraph, HeadingLevel } = await import('docx');

    const section = db.prepare('SELECT * FROM sections WHERE id = ?').get(ids.sec1);
    const pages = db.prepare('SELECT * FROM pages WHERE section_id = ? ORDER BY position').all(ids.sec1);

    const children = [
      new Paragraph({ text: section.title, heading: HeadingLevel.HEADING_1 }),
      ...pages.flatMap(p => [
        new Paragraph({ text: p.title, heading: HeadingLevel.HEADING_2 }),
      ]),
    ];

    const doc = new Document({ sections: [{ children }] });
    const buffer = await Packer.toBuffer(doc);

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(1000);
  });

  it('génère un buffer docx non vide pour un notebook complet', async () => {
    const { Document, Packer, Paragraph, HeadingLevel } = await import('docx');

    const notebook = db.prepare('SELECT * FROM notebooks WHERE id = ?').get(ids.nb1);
    const sections = db.prepare('SELECT * FROM sections WHERE notebook_id = ? ORDER BY position').all(ids.nb1);

    const children = [
      new Paragraph({ text: notebook.name, heading: HeadingLevel.TITLE }),
    ];
    for (const sec of sections) {
      children.push(new Paragraph({ text: sec.title, heading: HeadingLevel.HEADING_1 }));
      const pages = db.prepare('SELECT * FROM pages WHERE section_id = ? ORDER BY position').all(sec.id);
      for (const page of pages) {
        children.push(new Paragraph({ text: page.title, heading: HeadingLevel.HEADING_2 }));
      }
    }

    const doc = new Document({ sections: [{ children }] });
    const buffer = await Packer.toBuffer(doc);

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(1000);
  });

  it('génère un docx valide pour une page sans blocs', async () => {
    const { Document, Packer, Paragraph, HeadingLevel } = await import('docx');
    const page = db.prepare('SELECT * FROM pages WHERE id = ?').get(ids.p3);
    const doc = new Document({ sections: [{ children: [new Paragraph({ text: page.title, heading: HeadingLevel.HEADING_1 })] }] });
    const buffer = await Packer.toBuffer(doc);
    expect(buffer.length).toBeGreaterThan(500);
  });

  it('génère un docx valide pour un notebook sans sections', async () => {
    const { Document, Packer, Paragraph, HeadingLevel } = await import('docx');
    const nbId = db.prepare("INSERT INTO notebooks (name, icon, position) VALUES (?, ?, ?)").run('Empty NB', '📓', 3).lastInsertRowid;
    const notebook = db.prepare('SELECT * FROM notebooks WHERE id = ?').get(nbId);
    const doc = new Document({ sections: [{ children: [new Paragraph({ text: notebook.name, heading: HeadingLevel.TITLE })] }] });
    const buffer = await Packer.toBuffer(doc);
    expect(buffer.length).toBeGreaterThan(500);
  });
});
