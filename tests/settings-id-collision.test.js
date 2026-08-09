import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'netcodes-settings-collision-'));

const mockSafeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: vi.fn((s) => Buffer.from(`enc:${s}`)),
  decryptString: (b) => b.toString().replace(/^enc:/, ''),
};

vi.mock('electron', () => ({
  app: { getPath: () => tmpDir },
  safeStorage: mockSafeStorage,
}));

// File d'octets à servir sur les prochains appels de randomBytes. Vidée par
// défaut : dans ce cas le mock retombe sur la vraie implémentation, ce dont
// generateId a besoin pour sa boucle de retirage une fois la collision passée.
const queue = [];

vi.mock('crypto', async (importOriginal) => {
  const actual = await importOriginal();
  const realRandomBytes = actual.randomBytes;
  const randomBytes = vi.fn((...args) => {
    if (queue.length > 0) {
      return queue.shift();
    }
    return realRandomBytes(...args);
  });
  return {
    ...actual,
    randomBytes,
    default: {
      ...actual.default,
      randomBytes,
    },
  };
});

const settings = await import('../electron/settings.js');
const settingsFile = path.join(tmpDir, 'settings.json');

beforeEach(() => {
  fs.rmSync(settingsFile, { force: true });
  queue.length = 0;
  crypto.randomBytes.mockClear();
});

describe('settings v2 - collision d\'identifiants', () => {
  it('generateId retire un nouvel identifiant quand randomBytes rejoue un id déjà attribué', () => {
    // Première connexion, créée avec la vraie génération aléatoire.
    const existing = settings.addConnection({ name: 'Existante', type: 'sqlite', file: 'D:/existante.sqlite' });
    crypto.randomBytes.mockClear();

    // On force le prochain tirage à reproduire exactement l'id existant, puis
    // un tirage distinct (un seul bit modifié, donc différent de façon
    // déterministe — pas par chance).
    const collidingBuf = Buffer.from(existing.id, 'hex');
    const freshBuf = Buffer.from(collidingBuf);
    freshBuf[0] ^= 0xff;
    queue.push(collidingBuf, freshBuf);

    const created = settings.addConnection({ name: 'Nouvelle', type: 'sqlite', file: 'D:/nouvelle.sqlite' });

    // L'id retiré après collision est bien différent de l'id existant.
    expect(created.id).not.toBe(existing.id);
    expect(created.id).toBe(freshBuf.toString('hex'));

    // La collision a bien déclenché un second tirage (preuve du retirage,
    // pas juste d'un id différent obtenu par chance).
    expect(crypto.randomBytes).toHaveBeenCalledTimes(2);

    // Les deux connexions restent individuellement récupérables.
    const openExisting = settings.getConnectionForOpen(existing.id);
    expect(openExisting.file).toBe('D:/existante.sqlite');
    expect(openExisting.name).toBe('Existante');

    const openCreated = settings.getConnectionForOpen(created.id);
    expect(openCreated.file).toBe('D:/nouvelle.sqlite');
    expect(openCreated.name).toBe('Nouvelle');
  });
});
