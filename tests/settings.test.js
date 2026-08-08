import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'netcodes-settings-'));

const mockSafeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: vi.fn((s) => Buffer.from(`enc:${s}`)),
  decryptString: (b) => b.toString().replace(/^enc:/, ''),
};

vi.mock('electron', () => ({
  app: { getPath: () => tmpDir },
  safeStorage: mockSafeStorage,
}));

const settings = await import('../electron/settings.js');
const settingsFile = path.join(tmpDir, 'settings.json');

beforeEach(() => {
  fs.rmSync(settingsFile, { force: true });
  mockSafeStorage.encryptString.mockClear();
});

describe('settings v2', () => {
  it('addConnection chiffre le mot de passe et ne l\'expose jamais', () => {
    const saved = settings.addConnection({
      name: 'PG', type: 'postgres', host: 'h', port: 5432, database: 'db', user: 'u', password: 'secret',
    });
    expect(saved.id).toMatch(/^[0-9a-f]{8}$/);
    expect(saved.password).toBeUndefined();
    expect(saved.passwordEnc).toBeUndefined();
    const raw = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
    expect(raw.connections[0].passwordEnc).toBe(Buffer.from('enc:secret').toString('base64'));
    expect(JSON.stringify(raw)).not.toContain('secret');
    expect(settings.listConnections()[0].passwordEnc).toBeUndefined();
  });

  it('getConnectionForOpen déchiffre le mot de passe', () => {
    const { id } = settings.addConnection({
      name: 'PG', type: 'postgres', host: 'h', port: 5432, database: 'db', user: 'u', password: 'secret',
    });
    expect(settings.getConnectionForOpen(id).password).toBe('secret');
  });

  it('une connexion sqlite n\'a pas de mot de passe', () => {
    const { id } = settings.addConnection({ name: 'L', type: 'sqlite', file: 'D:/x.sqlite' });
    const cfg = settings.getConnectionForOpen(id);
    expect(cfg.file).toBe('D:/x.sqlite');
    expect(cfg.password).toBeUndefined();
  });

  // Finding 1 : `updateConnection` sans mot de passe ne doit JAMAIS réutiliser
  // le secret stocké vers une cible différente (host changé) — sinon un
  // renderer compromis pourrait repointer une connexion enregistrée vers un
  // hôte arbitraire tout en conservant le vrai mot de passe, et ça persiste.
  it('updateConnection sans mot de passe et endpoint différent refuse (host changé)', () => {
    const { id } = settings.addConnection({
      name: 'PG', type: 'postgres', host: 'h', port: 5432, database: 'db', user: 'u', password: 'secret',
    });
    expect(() => settings.updateConnection(id, {
      name: 'PG2', type: 'postgres', host: 'h2', port: 5432, database: 'db', user: 'u',
    })).toThrow(/mot de passe/i);
    // La tentative refusée ne doit pas avoir modifié la connexion stockée.
    const cfg = settings.getConnectionForOpen(id);
    expect(cfg.host).toBe('h');
    expect(cfg.password).toBe('secret');
  });

  it('updateConnection sans mot de passe et même endpoint (édition du seul nom) conserve le mot de passe stocké', () => {
    const { id } = settings.addConnection({
      name: 'PG', type: 'postgres', host: 'h', port: 5432, database: 'db', user: 'u', password: 'secret',
    });
    settings.updateConnection(id, { name: 'PG2', type: 'postgres', host: 'h', port: 5432, database: 'db', user: 'u' });
    const cfg = settings.getConnectionForOpen(id);
    expect(cfg.name).toBe('PG2');
    expect(cfg.host).toBe('h');
    expect(cfg.password).toBe('secret');
  });

  it('removeConnection supprime', () => {
    const { id } = settings.addConnection({ name: 'L', type: 'sqlite', file: 'D:/x.sqlite' });
    settings.removeConnection(id);
    expect(settings.listConnections()).toEqual([]);
  });

  it('migrateLegacyDbPath convertit dbPath en connexion sqlite', () => {
    fs.writeFileSync(settingsFile, JSON.stringify({ dbPath: 'D:/old/netcodes.sqlite' }));
    settings.migrateLegacyDbPath();
    const conns = settings.listConnections();
    expect(conns.length).toBe(1);
    expect(conns[0]).toMatchObject({ name: 'Base locale', type: 'sqlite', file: 'D:/old/netcodes.sqlite' });
    expect(JSON.parse(fs.readFileSync(settingsFile, 'utf-8')).dbPath).toBeUndefined();
    // Idempotent
    settings.migrateLegacyDbPath();
    expect(settings.listConnections().length).toBe(1);
  });

  it('migrateLegacyDbPath sans dbPath crée la connexion par défaut userData', () => {
    settings.migrateLegacyDbPath();
    const conns = settings.listConnections();
    expect(conns.length).toBe(1);
    expect(conns[0].file).toBe(path.join(tmpDir, 'netcodes.sqlite'));
  });

  // Finding 1: encryptString not invoked for sqlite connections
  it('addConnection sqlite n\'invoque pas encryptString même avec un mot de passe inutile', () => {
    settings.addConnection({ name: 'L', type: 'sqlite', file: 'D:/x.sqlite', password: 'inutile' });
    expect(mockSafeStorage.encryptString).not.toHaveBeenCalled();
    const stored = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
    expect(stored.connections[0].passwordEnc).toBeUndefined();
  });
});
