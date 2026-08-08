import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { manager } from '../electron/db/connection-manager.js';

function tmpFile(name) {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'netcodes-cm-')), name);
}

afterEach(async () => {
  await manager.closeAll();
});

describe('ConnectionManager', () => {
  it('open applique le schéma et get retourne l\'adaptateur', async () => {
    await manager.open({ id: 'c1', name: 'Test', type: 'sqlite', file: ':memory:' });
    expect(manager.status('c1')).toEqual({ state: 'connected', error: null });
    const db = manager.get('c1');
    const rows = await db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='notebooks'");
    expect(rows.length).toBe(1);
  });

  it('deux connexions simultanées sont indépendantes', async () => {
    await manager.open({ id: 'c1', name: 'A', type: 'sqlite', file: ':memory:' });
    await manager.open({ id: 'c2', name: 'B', type: 'sqlite', file: ':memory:' });
    await manager.get('c1').insert('INSERT INTO notebooks (name, position) VALUES (?, ?)', ['only-in-c1', 1]);
    expect((await manager.get('c1').all('SELECT * FROM notebooks')).length).toBe(1);
    expect((await manager.get('c2').all('SELECT * FROM notebooks')).length).toBe(0);
  });

  it('get sur une connexion inconnue ou fermée jette', async () => {
    expect(() => manager.get('nope')).toThrow('Connexion indisponible');
    await manager.open({ id: 'c1', name: 'A', type: 'sqlite', file: ':memory:' });
    await manager.close('c1');
    expect(() => manager.get('c1')).toThrow('Connexion indisponible');
    expect(manager.status('c1').state).toBe('closed');
  });

  it('fichier sqlite corrompu → statut error, open rejette', async () => {
    const p = tmpFile('corrupt.sqlite');
    // En-tête SQLite valide suivi d'ordures : integrity_check/pragma échoue.
    const buf = Buffer.alloc(4096, 0xff);
    buf.write('SQLite format 3\u0000', 0, 'utf-8');
    fs.writeFileSync(p, buf);
    await expect(manager.open({ id: 'bad', name: 'Bad', type: 'sqlite', file: p }))
      .rejects.toThrow(/corrompue/);
    expect(manager.status('bad').state).toBe('error');
    expect(manager.status('bad').error).toMatch(/corrompue/);
  });

  it('openAll continue malgré un échec et notifie onStatusChange', async () => {
    const events = [];
    manager.onStatusChange = (id, status) => events.push([id, status.state]);
    const p = tmpFile('corrupt.sqlite');
    const buf = Buffer.alloc(4096, 0xff);
    buf.write('SQLite format 3\u0000', 0, 'utf-8');
    fs.writeFileSync(p, buf);
    await manager.openAll([
      { id: 'ok1', name: 'OK', type: 'sqlite', file: ':memory:' },
      { id: 'bad1', name: 'Bad', type: 'sqlite', file: p },
    ]);
    expect(manager.status('ok1').state).toBe('connected');
    expect(manager.status('bad1').state).toBe('error');
    expect(events).toContainEqual(['ok1', 'connected']);
    expect(events).toContainEqual(['bad1', 'error']);
    manager.onStatusChange = null;
  });

  it('type inconnu → erreur claire', async () => {
    await expect(manager.open({ id: 'x', name: 'X', type: 'oracle' }))
      .rejects.toThrow(/Type de connexion inconnu/);
  });

  it('une ré-ouverture avec un type invalide ferme quand même la connexion précédente', async () => {
    await manager.open({ id: 'c1', name: 'A', type: 'sqlite', file: ':memory:' });
    const previous = manager.get('c1');
    await expect(manager.open({ id: 'c1', name: 'A', type: 'oracle' }))
      .rejects.toThrow(/Type de connexion inconnu/);
    // L'ancien adaptateur ne doit plus être détenu ni utilisable.
    expect(() => manager.get('c1')).toThrow('Connexion indisponible');
    // better-sqlite3 closes synchronously, so we check if db is null.
    expect(previous.db).toBeNull();
  });
});
