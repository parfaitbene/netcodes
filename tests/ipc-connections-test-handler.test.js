import { describe, it, expect, vi } from 'vitest';
import { resolveTestConfig } from '../electron/db/test-connection.js';

describe('resolveTestConfig', () => {
  it('mot de passe fourni par le renderer → utilisé tel quel, loadStored jamais appelé', () => {
    const loadStored = vi.fn();
    const cfg = {
      id: 'c1', type: 'postgres', host: 'db.example.com', port: 5432,
      database: 'app', user: 'root', password: 'secret',
    };
    const result = resolveTestConfig(cfg, loadStored);
    expect(result).toEqual({ ok: true, config: cfg });
    expect(loadStored).not.toHaveBeenCalled();
  });

  it('pas de mot de passe, id correspondant à la config stockée → mot de passe stocké injecté', () => {
    const stored = {
      id: 'c1', type: 'postgres', host: 'db.example.com', port: 5432,
      database: 'app', user: 'root', password: 'stored-secret',
    };
    const loadStored = vi.fn(() => stored);
    const cfg = {
      id: 'c1', type: 'postgres', host: 'db.example.com', port: 5432,
      database: 'app', user: 'root',
    };
    const result = resolveTestConfig(cfg, loadStored);
    expect(result).toEqual({
      ok: true,
      config: { ...cfg, password: 'stored-secret' },
    });
    expect(loadStored).toHaveBeenCalledWith('c1');
  });

  it('pas de mot de passe, id présent mais host différent → refusé, aucun mot de passe dans la réponse', () => {
    const stored = {
      id: 'c1', type: 'postgres', host: 'db.example.com', port: 5432,
      database: 'app', user: 'root', password: 'stored-secret',
    };
    const loadStored = vi.fn(() => stored);
    const cfg = {
      id: 'c1', type: 'postgres', host: 'attacker.example.com', port: 5432,
      database: 'app', user: 'root',
    };
    const result = resolveTestConfig(cfg, loadStored);
    expect(result).toEqual({ ok: false, error: 'Saisissez le mot de passe pour tester une autre cible.' });
    expect(JSON.stringify(result)).not.toMatch(/stored-secret/);
    expect(JSON.stringify(result)).not.toMatch(/password/);
  });

  it('pas de mot de passe, id présent mais port différent → refusé, aucun mot de passe dans la réponse', () => {
    const stored = {
      id: 'c1', type: 'postgres', host: 'db.example.com', port: 5432,
      database: 'app', user: 'root', password: 'stored-secret',
    };
    const loadStored = vi.fn(() => stored);
    const cfg = {
      id: 'c1', type: 'postgres', host: 'db.example.com', port: 6543,
      database: 'app', user: 'root',
    };
    const result = resolveTestConfig(cfg, loadStored);
    expect(result).toEqual({ ok: false, error: 'Saisissez le mot de passe pour tester une autre cible.' });
    expect(JSON.stringify(result)).not.toMatch(/stored-secret/);
    expect(JSON.stringify(result)).not.toMatch(/password/);
  });

  it('pas de mot de passe, id présent mais database différente → refusé, aucun mot de passe dans la réponse', () => {
    const stored = {
      id: 'c1', type: 'postgres', host: 'db.example.com', port: 5432,
      database: 'app', user: 'root', password: 'stored-secret',
    };
    const loadStored = vi.fn(() => stored);
    const cfg = {
      id: 'c1', type: 'postgres', host: 'db.example.com', port: 5432,
      database: 'autre-app', user: 'root',
    };
    const result = resolveTestConfig(cfg, loadStored);
    expect(result).toEqual({ ok: false, error: 'Saisissez le mot de passe pour tester une autre cible.' });
    expect(JSON.stringify(result)).not.toMatch(/stored-secret/);
    expect(JSON.stringify(result)).not.toMatch(/password/);
  });

  it('pas de mot de passe, id présent mais user différent → refusé, aucun mot de passe dans la réponse', () => {
    const stored = {
      id: 'c1', type: 'postgres', host: 'db.example.com', port: 5432,
      database: 'app', user: 'root', password: 'stored-secret',
    };
    const loadStored = vi.fn(() => stored);
    const cfg = {
      id: 'c1', type: 'postgres', host: 'db.example.com', port: 5432,
      database: 'app', user: 'admin',
    };
    const result = resolveTestConfig(cfg, loadStored);
    expect(result).toEqual({ ok: false, error: 'Saisissez le mot de passe pour tester une autre cible.' });
    expect(JSON.stringify(result)).not.toMatch(/stored-secret/);
    expect(JSON.stringify(result)).not.toMatch(/password/);
  });

  it('sqlite : pas de mot de passe, id présent mais file différent → refusé, aucun mot de passe dans la réponse', () => {
    const stored = { id: 'c1', type: 'sqlite', file: '/data/notebook.sqlite' };
    const loadStored = vi.fn(() => stored);
    const cfg = { id: 'c1', type: 'sqlite', file: '/tmp/attacker.sqlite' };
    const result = resolveTestConfig(cfg, loadStored);
    expect(result).toEqual({ ok: false, error: 'Saisissez le mot de passe pour tester une autre cible.' });
    expect(JSON.stringify(result)).not.toMatch(/password/);
  });

  it('sqlite : pas de mot de passe, id correspondant au même fichier → accepté tel quel', () => {
    const stored = { id: 'c1', type: 'sqlite', file: '/data/notebook.sqlite' };
    const loadStored = vi.fn(() => stored);
    const cfg = { id: 'c1', type: 'sqlite', file: '/data/notebook.sqlite' };
    const result = resolveTestConfig(cfg, loadStored);
    expect(result).toEqual({ ok: true, config: { ...cfg, password: undefined } });
  });

  it('pas de mot de passe, id inconnu (loadStored jette) → ne plante pas, tente avec ce qui a été fourni', () => {
    const loadStored = vi.fn(() => { throw new Error('Connexion inconnue : nope'); });
    const cfg = {
      id: 'nope', type: 'postgres', host: 'db.example.com', port: 5432,
      database: 'app', user: 'root',
    };
    const result = resolveTestConfig(cfg, loadStored);
    expect(result).toEqual({ ok: true, config: cfg });
  });

  it('port comparé numériquement : stocké 5432 vs fourni "5432" → considéré identique', () => {
    const stored = {
      id: 'c1', type: 'postgres', host: 'db.example.com', port: 5432,
      database: 'app', user: 'root', password: 'stored-secret',
    };
    const loadStored = vi.fn(() => stored);
    const cfg = {
      id: 'c1', type: 'postgres', host: 'db.example.com', port: '5432',
      database: 'app', user: 'root',
    };
    const result = resolveTestConfig(cfg, loadStored);
    expect(result).toEqual({
      ok: true,
      config: { ...cfg, password: 'stored-secret' },
    });
  });

  it('pas de mot de passe et pas d\'id → tente avec ce qui a été fourni', () => {
    const loadStored = vi.fn();
    const cfg = { type: 'postgres', host: 'db.example.com', port: 5432, database: 'app', user: 'root' };
    const result = resolveTestConfig(cfg, loadStored);
    expect(result).toEqual({ ok: true, config: cfg });
    expect(loadStored).not.toHaveBeenCalled();
  });
});
