import { manager } from './db/connection-manager.js';

const db = (connId) => manager.get(connId);

// Notebook operations
export const notebookOps = {
  getAll: (connId) =>
    db(connId).all('SELECT * FROM notebooks ORDER BY position'),

  getById: (connId, id) =>
    db(connId).get('SELECT * FROM notebooks WHERE id = ?', [id]),

  create: async (connId, name, icon = '📓') => {
    const d = db(connId);
    const maxPos = await d.get('SELECT MAX(position) as max FROM notebooks');
    const position = (maxPos.max || 0) + 1;
    return d.insert('INSERT INTO notebooks (name, icon, position) VALUES (?, ?, ?)', [name, icon, position]);
  },

  update: (connId, id, name, icon) =>
    db(connId).run('UPDATE notebooks SET name = ?, icon = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [name, icon, id]),

  delete: (connId, id) =>
    db(connId).run('DELETE FROM notebooks WHERE id = ?', [id]),

  reorder: (connId, id, newPosition) =>
    db(connId).run('UPDATE notebooks SET position = ? WHERE id = ?', [newPosition, id]),
};

// Section operations
export const sectionOps = {
  getAll: (connId) =>
    db(connId).all('SELECT * FROM sections ORDER BY notebook_id, position'),

  getByNotebook: (connId, notebookId) =>
    db(connId).all('SELECT * FROM sections WHERE notebook_id = ? ORDER BY position', [notebookId]),

  getById: (connId, id) =>
    db(connId).get('SELECT * FROM sections WHERE id = ?', [id]),

  create: async (connId, notebookId, title, color = '#007bff') => {
    const d = db(connId);
    const maxPos = await d.get('SELECT MAX(position) as max FROM sections WHERE notebook_id = ?', [notebookId]);
    const position = (maxPos.max || 0) + 1;
    return d.insert('INSERT INTO sections (notebook_id, title, color, position) VALUES (?, ?, ?, ?)', [notebookId, title, color, position]);
  },

  update: (connId, id, title, color) =>
    db(connId).run('UPDATE sections SET title = ?, color = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [title, color, id]),

  delete: (connId, id) =>
    db(connId).run('DELETE FROM sections WHERE id = ?', [id]),

  reorder: (connId, id, newPosition) =>
    db(connId).run('UPDATE sections SET position = ? WHERE id = ?', [newPosition, id]),

  move: async (connId, id, newNotebookId) => {
    const d = db(connId);
    const maxPos = await d.get('SELECT MAX(position) as max FROM sections WHERE notebook_id = ?', [newNotebookId]);
    const position = (maxPos.max || 0) + 1;
    return d.run('UPDATE sections SET notebook_id = ?, position = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newNotebookId, position, id]);
  },
};

// Page operations
export const pageOps = {
  getAll: (connId) =>
    db(connId).all('SELECT * FROM pages ORDER BY section_id, position'),

  getBySection: (connId, sectionId) =>
    db(connId).all('SELECT * FROM pages WHERE section_id = ? ORDER BY position', [sectionId]),

  getById: (connId, id) =>
    db(connId).get('SELECT * FROM pages WHERE id = ?', [id]),

  getFavorites: (connId) =>
    db(connId).all('SELECT * FROM pages WHERE favorite = 1 ORDER BY updated_at DESC'),

  create: async (connId, sectionId, title) => {
    const d = db(connId);
    const maxPos = await d.get('SELECT MAX(position) as max FROM pages WHERE section_id = ?', [sectionId]);
    const position = (maxPos.max || 0) + 1;
    return d.insert('INSERT INTO pages (section_id, title, position) VALUES (?, ?, ?)', [sectionId, title, position]);
  },

  update: (connId, id, title) =>
    db(connId).run('UPDATE pages SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [title, id]),

  // `NOT favorite` n'existe pas en PG/MySQL sur un INT : portable via 1 - favorite.
  toggleFavorite: (connId, id) =>
    db(connId).run('UPDATE pages SET favorite = 1 - favorite, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]),

  delete: (connId, id) =>
    db(connId).run('DELETE FROM pages WHERE id = ?', [id]),

  reorder: (connId, id, newPosition) =>
    db(connId).run('UPDATE pages SET position = ? WHERE id = ?', [newPosition, id]),

  move: async (connId, id, newSectionId) => {
    const d = db(connId);
    const maxPos = await d.get('SELECT MAX(position) as max FROM pages WHERE section_id = ?', [newSectionId]);
    const position = (maxPos.max || 0) + 1;
    return d.run('UPDATE pages SET section_id = ?, position = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newSectionId, position, id]);
  },
};

// Block operations
export const blockOps = {
  getByPage: (connId, pageId) =>
    db(connId).all(
      'SELECT id, page_id, type, title, content, language, filename, filepath, position, created_at, updated_at FROM blocks WHERE page_id = ? ORDER BY position',
      [pageId],
    ),

  getById: (connId, id) =>
    db(connId).get(
      'SELECT id, page_id, type, title, content, language, filename, filepath, position, created_at, updated_at FROM blocks WHERE id = ?',
      [id],
    ),

  create: async (connId, pageId, type, content, language = null, filename = null, title = null) => {
    const d = db(connId);
    const maxPos = await d.get('SELECT MAX(position) as max FROM blocks WHERE page_id = ?', [pageId]);
    const position = (maxPos.max || 0) + 1;
    return d.insert(
      'INSERT INTO blocks (page_id, type, content, language, filename, title, position) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [pageId, type, content, language, filename, title, position],
    );
  },

  update: (connId, id, content, language = null, title = null) =>
    db(connId).run('UPDATE blocks SET content = ?, language = ?, title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [content, language, title, id]),

  delete: (connId, id) =>
    db(connId).run('DELETE FROM blocks WHERE id = ?', [id]),

  reorder: (connId, id, newPosition) =>
    db(connId).run('UPDATE blocks SET position = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newPosition, id]),
};

// Tag operations
export const tagOps = {
  getAll: (connId) =>
    db(connId).all('SELECT * FROM tags ORDER BY name'),

  getByPage: (connId, pageId) =>
    db(connId).all(`
      SELECT t.* FROM tags t
      INNER JOIN page_tags pt ON t.id = pt.tag_id
      WHERE pt.page_id = ?
      ORDER BY t.name
    `, [pageId]),

  create: (connId, name, color = '#6c757d') =>
    db(connId).insert('INSERT INTO tags (name, color) VALUES (?, ?)', [name, color]),

  // `INSERT OR IGNORE` est du SQLite pur ; test-puis-insert portable.
  addToPage: async (connId, pageId, tagId) => {
    const d = db(connId);
    const existing = await d.get('SELECT 1 AS one FROM page_tags WHERE page_id = ? AND tag_id = ?', [pageId, tagId]);
    if (!existing) {
      await d.run('INSERT INTO page_tags (page_id, tag_id) VALUES (?, ?)', [pageId, tagId]);
    }
  },

  removeFromPage: (connId, pageId, tagId) =>
    db(connId).run('DELETE FROM page_tags WHERE page_id = ? AND tag_id = ?', [pageId, tagId]),
};

// Search operations
export const searchOps = {
  // LIKE est sensible à la casse en PG ; LOWER() partout pour un comportement
  // homogène quel que soit le fournisseur.
  search: async (connId, query) => {
    const d = db(connId);
    const term = `%${query.toLowerCase()}%`;

    const notebooks = await d.all(`
      SELECT id AS notebook_id, name AS notebook_name
      FROM notebooks
      WHERE LOWER(name) LIKE ?
      ORDER BY name
    `, [term]);

    const sections = await d.all(`
      SELECT s.id AS section_id, s.title AS section_title,
             n.id AS notebook_id, n.name AS notebook_name
      FROM sections s
      JOIN notebooks n ON s.notebook_id = n.id
      WHERE LOWER(s.title) LIKE ?
      ORDER BY s.title
    `, [term]);

    // ORDER BY sur un SELECT DISTINCT doit référencer une colonne présente dans
    // le SELECT : PostgreSQL et MySQL l'exigent strictement (SQLite l'ignore).
    // On sélectionne donc explicitement p.updated_at (aliasé) et on trie sur cet
    // alias. `updated_at` dépend fonctionnellement de p.id (déjà sélectionné),
    // donc son ajout ne change pas le nombre de lignes renvoyées par DISTINCT.
    const pages = await d.all(`
      SELECT DISTINCT
        p.id          AS page_id,
        p.title       AS page_title,
        p.favorite    AS page_favorite,
        p.updated_at  AS page_updated_at,
        s.id          AS section_id,
        s.title       AS section_title,
        n.id          AS notebook_id,
        n.name        AS notebook_name,
        b.id          AS block_id,
        b.title       AS block_title,
        b.content     AS block_content,
        b.type        AS block_type,
        b.language    AS block_language
      FROM pages p
      JOIN sections s ON p.section_id = s.id
      JOIN notebooks n ON s.notebook_id = n.id
      LEFT JOIN blocks b ON b.page_id = p.id
      WHERE LOWER(p.title) LIKE ?
         OR LOWER(b.title) LIKE ?
         OR LOWER(b.content) LIKE ?
      ORDER BY page_updated_at DESC
    `, [term, term, term]);

    return { notebooks, sections, pages };
  },
};
