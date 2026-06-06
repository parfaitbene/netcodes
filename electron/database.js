import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db = null;

export function initDatabase(dbPath) {
  if (!dbPath) {
    dbPath = path.join(app.getPath('userData'), 'netcodes.sqlite');
  }

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('integrity_check');
  db.exec('REINDEX;');

  // Read and execute schema
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  db.exec(schema);

  return db;
}

export function getDatabase() {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
}

// Notebook operations
export const notebookOps = {
  getAll: () => {
    const stmt = db.prepare('SELECT * FROM notebooks ORDER BY position');
    return stmt.all();
  },

  getById: (id) => {
    const stmt = db.prepare('SELECT * FROM notebooks WHERE id = ?');
    return stmt.get(id);
  },

  create: (name, icon = '📓') => {
    const maxPos = db.prepare('SELECT MAX(position) as max FROM notebooks').get();
    const position = (maxPos.max || 0) + 1;
    const stmt = db.prepare('INSERT INTO notebooks (name, icon, position) VALUES (?, ?, ?)');
    const result = stmt.run(name, icon, position);
    return result.lastInsertRowid;
  },

  update: (id, name, icon) => {
    const stmt = db.prepare('UPDATE notebooks SET name = ?, icon = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    return stmt.run(name, icon, id);
  },

  delete: (id) => {
    const stmt = db.prepare('DELETE FROM notebooks WHERE id = ?');
    return stmt.run(id);
  },

  reorder: (id, newPosition) => {
    const stmt = db.prepare('UPDATE notebooks SET position = ? WHERE id = ?');
    return stmt.run(newPosition, id);
  }
};

// Section operations
export const sectionOps = {
  getAll: () => {
    const stmt = db.prepare('SELECT * FROM sections ORDER BY notebook_id, position');
    return stmt.all();
  },

  getByNotebook: (notebookId) => {
    const stmt = db.prepare('SELECT * FROM sections WHERE notebook_id = ? ORDER BY position');
    return stmt.all(notebookId);
  },

  getById: (id) => {
    const stmt = db.prepare('SELECT * FROM sections WHERE id = ?');
    return stmt.get(id);
  },

  create: (notebookId, title, color = '#007bff') => {
    const maxPos = db.prepare('SELECT MAX(position) as max FROM sections WHERE notebook_id = ?').get(notebookId);
    const position = (maxPos.max || 0) + 1;
    const stmt = db.prepare('INSERT INTO sections (notebook_id, title, color, position) VALUES (?, ?, ?, ?)');
    const result = stmt.run(notebookId, title, color, position);
    return result.lastInsertRowid;
  },

  update: (id, title, color) => {
    const stmt = db.prepare('UPDATE sections SET title = ?, color = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    return stmt.run(title, color, id);
  },

  delete: (id) => {
    const stmt = db.prepare('DELETE FROM sections WHERE id = ?');
    return stmt.run(id);
  },

  reorder: (id, newPosition) => {
    const stmt = db.prepare('UPDATE sections SET position = ? WHERE id = ?');
    return stmt.run(newPosition, id);
  },

  move: (id, newNotebookId) => {
    const maxPos = db.prepare('SELECT MAX(position) as max FROM sections WHERE notebook_id = ?').get(newNotebookId);
    const position = (maxPos.max || 0) + 1;
    const stmt = db.prepare('UPDATE sections SET notebook_id = ?, position = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    return stmt.run(newNotebookId, position, id);
  }
};

// Page operations
export const pageOps = {
  getAll: () => {
    const stmt = db.prepare('SELECT * FROM pages ORDER BY section_id, favorite, position');
    return stmt.all();
  },

  getBySection: (sectionId) => {
    const stmt = db.prepare('SELECT * FROM pages WHERE section_id = ? ORDER BY favorite, position');
    return stmt.all(sectionId);
  },

  getById: (id) => {
    const stmt = db.prepare('SELECT * FROM pages WHERE id = ?');
    return stmt.get(id);
  },

  getFavorites: () => {
    const stmt = db.prepare('SELECT * FROM pages WHERE favorite = 1 ORDER BY updated_at DESC');
    return stmt.all();
  },

  create: (sectionId, title) => {
    const maxPos = db.prepare('SELECT MAX(position) as max FROM pages WHERE section_id = ?').get(sectionId);
    const position = (maxPos.max || 0) + 1;
    const stmt = db.prepare('INSERT INTO pages (section_id, title, position) VALUES (?, ?, ?)');
    const result = stmt.run(sectionId, title, position);
    return result.lastInsertRowid;
  },

  update: (id, title) => {
    const stmt = db.prepare('UPDATE pages SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    return stmt.run(title, id);
  },

  toggleFavorite: (id) => {
    const stmt = db.prepare('UPDATE pages SET favorite = NOT favorite, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    return stmt.run(id);
  },

  delete: (id) => {
    const stmt = db.prepare('DELETE FROM pages WHERE id = ?');
    return stmt.run(id);
  },

  reorder: (id, newPosition) => {
    const stmt = db.prepare('UPDATE pages SET position = ? WHERE id = ?');
    return stmt.run(newPosition, id);
  },

  move: (id, newSectionId) => {
    const maxPos = db.prepare('SELECT MAX(position) as max FROM pages WHERE section_id = ?').get(newSectionId);
    const position = (maxPos.max || 0) + 1;
    const stmt = db.prepare('UPDATE pages SET section_id = ?, position = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    return stmt.run(newSectionId, position, id);
  }
};

// Block operations
export const blockOps = {
  getByPage: (pageId) => {
    const stmt = db.prepare('SELECT id, page_id, type, title, content, language, filename, filepath, position, created_at, updated_at FROM blocks WHERE page_id = ? ORDER BY position');
    return stmt.all(pageId);
  },

  getById: (id) => {
    const stmt = db.prepare('SELECT id, page_id, type, title, content, language, filename, filepath, position, created_at, updated_at FROM blocks WHERE id = ?');
    return stmt.get(id);
  },

  create: (pageId, type, content, language = null, filename = null, title = null) => {
    const maxPos = db.prepare('SELECT MAX(position) as max FROM blocks WHERE page_id = ?').get(pageId);
    const position = (maxPos.max || 0) + 1;
    const stmt = db.prepare('INSERT INTO blocks (page_id, type, content, language, filename, title, position) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const result = stmt.run(pageId, type, content, language, filename, title, position);
    return result.lastInsertRowid;
  },

  update: (id, content, language = null, title = null) => {
    const stmt = db.prepare('UPDATE blocks SET content = ?, language = ?, title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    return stmt.run(content, language, title, id);
  },

  delete: (id) => {
    const stmt = db.prepare('DELETE FROM blocks WHERE id = ?');
    return stmt.run(id);
  },

  reorder: (id, newPosition) => {
    const stmt = db.prepare('UPDATE blocks SET position = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    return stmt.run(newPosition, id);
  }
};

// Tag operations
export const tagOps = {
  getAll: () => {
    const stmt = db.prepare('SELECT * FROM tags ORDER BY name');
    return stmt.all();
  },

  getByPage: (pageId) => {
    const stmt = db.prepare(`
      SELECT t.* FROM tags t
      INNER JOIN page_tags pt ON t.id = pt.tag_id
      WHERE pt.page_id = ?
      ORDER BY t.name
    `);
    return stmt.all(pageId);
  },

  create: (name, color = '#6c757d') => {
    const stmt = db.prepare('INSERT INTO tags (name, color) VALUES (?, ?)');
    const result = stmt.run(name, color);
    return result.lastInsertRowid;
  },

  addToPage: (pageId, tagId) => {
    const stmt = db.prepare('INSERT OR IGNORE INTO page_tags (page_id, tag_id) VALUES (?, ?)');
    return stmt.run(pageId, tagId);
  },

  removeFromPage: (pageId, tagId) => {
    const stmt = db.prepare('DELETE FROM page_tags WHERE page_id = ? AND tag_id = ?');
    return stmt.run(pageId, tagId);
  }
};

// Search operations
export const searchOps = {
  search: (query) => {
    const term = `%${query}%`;

    const notebooks = db.prepare(`
      SELECT id AS notebook_id, name AS notebook_name
      FROM notebooks
      WHERE name LIKE ?
      ORDER BY name
    `).all(term);

    const sections = db.prepare(`
      SELECT s.id AS section_id, s.title AS section_title,
             n.id AS notebook_id, n.name AS notebook_name
      FROM sections s
      JOIN notebooks n ON s.notebook_id = n.id
      WHERE s.title LIKE ?
      ORDER BY s.title
    `).all(term);

    const pages = db.prepare(`
      SELECT DISTINCT
        p.id        AS page_id,
        p.title     AS page_title,
        s.id        AS section_id,
        s.title     AS section_title,
        n.id        AS notebook_id,
        n.name      AS notebook_name,
        b.id        AS block_id,
        b.title     AS block_title,
        b.content   AS block_content,
        b.language  AS block_language
      FROM pages p
      JOIN sections s ON p.section_id = s.id
      JOIN notebooks n ON s.notebook_id = n.id
      LEFT JOIN blocks b ON b.page_id = p.id
      WHERE p.title LIKE ?
         OR b.title LIKE ?
         OR b.content LIKE ?
      ORDER BY p.updated_at DESC
    `).all(term, term, term);

    return { notebooks, sections, pages };
  }
};

export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}
