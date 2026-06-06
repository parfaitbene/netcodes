import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schema = fs.readFileSync(path.join(__dirname, '../../electron/schema.sql'), 'utf-8');

export function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(schema);
  return db;
}

export function seedDb(db) {
  const nb1 = db.prepare("INSERT INTO notebooks (name, icon, position) VALUES (?, ?, ?)").run('Notebook A', '📓', 1).lastInsertRowid;
  const nb2 = db.prepare("INSERT INTO notebooks (name, icon, position) VALUES (?, ?, ?)").run('Notebook B', '📘', 2).lastInsertRowid;

  const sec1 = db.prepare("INSERT INTO sections (notebook_id, title, color, position) VALUES (?, ?, ?, ?)").run(nb1, 'Section 1', '#007bff', 1).lastInsertRowid;
  const sec2 = db.prepare("INSERT INTO sections (notebook_id, title, color, position) VALUES (?, ?, ?, ?)").run(nb1, 'Section 2', '#28a745', 2).lastInsertRowid;
  const sec3 = db.prepare("INSERT INTO sections (notebook_id, title, color, position) VALUES (?, ?, ?, ?)").run(nb2, 'Section 3', '#dc3545', 1).lastInsertRowid;

  const p1 = db.prepare("INSERT INTO pages (section_id, title, position) VALUES (?, ?, ?)").run(sec1, 'Page 1', 1).lastInsertRowid;
  const p2 = db.prepare("INSERT INTO pages (section_id, title, position) VALUES (?, ?, ?)").run(sec1, 'Page 2', 2).lastInsertRowid;
  const p3 = db.prepare("INSERT INTO pages (section_id, title, position) VALUES (?, ?, ?)").run(sec2, 'Page 3', 1).lastInsertRowid;

  const b1 = db.prepare("INSERT INTO blocks (page_id, type, content, language, title, position) VALUES (?, ?, ?, ?, ?, ?)").run(p1, 'text', '# Hello\n\nWorld', null, 'Intro', 1).lastInsertRowid;
  const b2 = db.prepare("INSERT INTO blocks (page_id, type, content, language, title, position) VALUES (?, ?, ?, ?, ?, ?)").run(p1, 'code', 'console.log("hi")', 'javascript', 'Snippet', 2).lastInsertRowid;
  const b3 = db.prepare("INSERT INTO blocks (page_id, type, content, language, title, position) VALUES (?, ?, ?, ?, ?, ?)").run(p2, 'text', 'Plain text', null, null, 1).lastInsertRowid;

  return { nb1, nb2, sec1, sec2, sec3, p1, p2, p3, b1, b2, b3 };
}
