import { describe, it, expect, vi, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';

// database.js imports { app } from 'electron'; only used when no dbPath is given.
vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir() } }));

const { initDatabase, closeDatabase, searchOps } = await import('../electron/database.js');

function tmpDbPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'netcodes-test-')), 'test.sqlite');
}

afterEach(() => {
  closeDatabase();
});

describe('initDatabase', () => {
  it('creates the schema on a fresh file and search works', () => {
    const dbPath = tmpDbPath();
    const db = initDatabase(dbPath);

    db.prepare("INSERT INTO notebooks (name, position) VALUES ('Docker notes', 1)").run();
    const { notebooks, sections, pages } = searchOps.search('docker');

    expect(notebooks).toHaveLength(1);
    expect(sections).toHaveLength(0);
    expect(pages).toHaveLength(0);
  });

  it('rejects a corrupted database file with a clear error', () => {
    const dbPath = tmpDbPath();

    // Build a healthy multi-page database, then wreck interior pages.
    const db = new Database(dbPath);
    db.exec('CREATE TABLE blocks_fill (id INTEGER PRIMARY KEY, content TEXT)');
    const insert = db.prepare('INSERT INTO blocks_fill (content) VALUES (?)');
    const filler = 'x'.repeat(1024);
    const fill = db.transaction(() => {
      for (let i = 0; i < 200; i++) insert.run(filler);
    });
    fill();
    db.close();

    const fd = fs.openSync(dbPath, 'r+');
    const garbage = Buffer.alloc(8192, 0xff);
    fs.writeSync(fd, garbage, 0, garbage.length, 8192);
    fs.closeSync(fd);

    expect(() => initDatabase(dbPath)).toThrow(/corrompue/);
  });
});
