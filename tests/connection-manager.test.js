import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { EventEmitter } from 'events';
import { manager, normalizeConnectionError } from '../electron/db/connection-manager.js';

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

  it('serveur injoignable (port fermé) → status.error est une chaîne non vide', async () => {
    // Port 1 est réservé et n'a jamais de service en écoute en local : le
    // refus (ECONNREFUSED, potentiellement enveloppé dans un AggregateError
    // sur un hôte dual-stack) est immédiat, pas de timeout à attendre.
    await expect(manager.open({
      id: 'closed-port', name: 'Injoignable', type: 'postgres',
      host: 'localhost', port: 1, database: 'x', user: 'x', password: 'x',
    })).rejects.toThrow();
    const status = manager.status('closed-port');
    expect(status.state).toBe('error');
    expect(status.error).toBeTruthy();
    expect(status.error.length).toBeGreaterThan(0);
  }, 10000);
});

// Finding 2 de la revue : un serveur qui meurt en cours de session (ex.
// redémarrage MySQL/PG) émet 'error' sur l'adaptateur mais ne repasse jamais
// par open()/close() — sans le hook onFatalError câblé dans open(), le
// statut restait bloqué à 'connected' indéfiniment. On simule cette perte de
// connexion avec la même technique que tests/adapter-contract.test.js
// (mock du driver, emit('error') a posteriori) mais au niveau du manager,
// pour vérifier que le statut EXPOSÉ passe bien à 'error'.
describe('ConnectionManager — erreur fatale post-connexion', () => {
  it("une erreur fatale sur l'adaptateur MySQL fait passer le statut à 'error' avec un message non vide", async () => {
    const mysql = (await import('mysql2/promise')).default;
    const fakeConn = new EventEmitter();
    fakeConn.end = vi.fn().mockResolvedValue(undefined);
    fakeConn.query = vi.fn().mockResolvedValue([[], []]);
    const createConnSpy = vi.spyOn(mysql, 'createConnection').mockResolvedValue(fakeConn);
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await manager.open({
        id: 'fatal-mysql', name: 'M', type: 'mysql',
        host: 'h', port: 3306, database: 'd', user: 'u', password: 'p',
      });
      expect(manager.status('fatal-mysql').state).toBe('connected');

      // Perte de connexion côté serveur pendant l'inactivité.
      fakeConn.emit('error', new Error('connexion perdue'));

      const status = manager.status('fatal-mysql');
      expect(status.state).toBe('error');
      expect(status.error).toBeTruthy();
      // L'adaptateur mort reste renvoyé par get() jusqu'ici ; get() doit
      // désormais refuser puisque le statut n'est plus 'connected'.
      expect(() => manager.get('fatal-mysql')).toThrow('Connexion indisponible');
    } finally {
      createConnSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    }
  });

  it("une erreur fatale sur un adaptateur déjà remplacé ne ressuscite pas un statut périmé", async () => {
    const mysql = (await import('mysql2/promise')).default;
    const fakeConn1 = new EventEmitter();
    fakeConn1.end = vi.fn().mockResolvedValue(undefined);
    fakeConn1.query = vi.fn().mockResolvedValue([[], []]);
    const createConnSpy = vi.spyOn(mysql, 'createConnection').mockResolvedValue(fakeConn1);
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await manager.open({
        id: 'stale-mysql', name: 'M', type: 'mysql',
        host: 'h', port: 3306, database: 'd', user: 'u', password: 'p',
      });
      // Remplacée par une reconnexion réussie entre-temps (sqlite, pour ne
      // pas dépendre d'un second mock mysql).
      await manager.open({ id: 'stale-mysql', name: 'M2', type: 'sqlite', file: ':memory:' });
      expect(manager.status('stale-mysql').state).toBe('connected');

      // L'ancien adaptateur MySQL (déjà remplacé) émet son erreur tardive :
      // ne doit pas écraser le statut 'connected' de la nouvelle connexion.
      fakeConn1.emit('error', new Error('erreur tardive'));
      expect(manager.status('stale-mysql').state).toBe('connected');
    } finally {
      createConnSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    }
  });
});

// Finding 3 de la revue : open() ne se gardait contre la ré-entrance que via
// `this.connections.has(id)`, or un open() en cours n'y figure pas encore.
// Deux open() concurrents pour le même id construisaient donc chacun un
// adaptateur ; le perdant n'était jamais refermé (fuite), et un close()
// arrivant pendant un open() en cours pouvait se faire réenregistrer
// par-dessus par l'open() qui complète ensuite.
describe('ConnectionManager — open() concurrents (supersession)', () => {
  it('deux open() concurrents pour le même id laissent exactement un adaptateur vivant et un statut connecté', async () => {
    const cfg = { id: 'race-open', name: 'A', type: 'sqlite', file: ':memory:' };
    const [a, b] = await Promise.all([manager.open(cfg), manager.open(cfg)]);

    expect(manager.status('race-open').state).toBe('connected');
    const live = manager.get('race-open');

    // Exactement l'un des deux adaptateurs construits est celui enregistré ;
    // l'autre a été supersédé et refermé par lui-même (sans être enregistré).
    expect([a, b]).toContain(live);
    const superseded = a === live ? b : a;
    expect(superseded).not.toBe(live);
    // better-sqlite3 ferme de façon synchrone : db est mis à null.
    expect(superseded.db).toBeNull();
    expect(live.db).not.toBeNull();
  });

  it('un close() qui survient pendant un open() en cours gagne : rien ne reste enregistré', async () => {
    const cfg = { id: 'race-close', name: 'A', type: 'sqlite', file: ':memory:' };

    const openPromise = manager.open(cfg); // démarre, pas encore enregistré
    await manager.close('race-close');     // gagne la course : rien à fermer, statut 'closed'
    const resolvedAdapter = await openPromise; // se termine ensuite, supersédé

    expect(manager.status('race-close').state).toBe('closed');
    expect(() => manager.get('race-close')).toThrow('Connexion indisponible');
    // L'open() supersédé a refermé ce qu'il venait de construire au lieu de
    // le réenregistrer par-dessus la fermeture.
    expect(resolvedAdapter.db).toBeNull();
  });
});

describe('normalizeConnectionError', () => {
  it('AggregateError avec erreurs enfants ECONNREFUSED → message non vide contenant le détail utile', () => {
    const child1 = Object.assign(new Error('connect ECONNREFUSED ::1:5432'), { code: 'ECONNREFUSED' });
    const child2 = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), { code: 'ECONNREFUSED' });
    const agg = new AggregateError([child1, child2], '');
    const result = normalizeConnectionError(agg);
    expect(result).not.toBe('');
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain('ECONNREFUSED');
  });

  it('message vide + code → utilise le code', () => {
    const err = Object.assign(new Error(''), { code: 'ECONNREFUSED' });
    expect(normalizeConnectionError(err)).toBe('ECONNREFUSED');
  });

  it('message normal → inchangé', () => {
    const err = new Error('Erreur explicite de connexion');
    expect(normalizeConnectionError(err)).toBe('Erreur explicite de connexion');
  });

  it('messages enfants dupliqués → dédupliqués', () => {
    const child1 = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), { code: 'ECONNREFUSED' });
    const child2 = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), { code: 'ECONNREFUSED' });
    const agg = new AggregateError([child1, child2], '');
    const result = normalizeConnectionError(agg);
    expect(result).toBe('connect ECONNREFUSED 127.0.0.1:5432');
  });

  it('AggregateError sans message enfant utilisable mais avec code sur l\'agrégat → utilise le code', () => {
    const child1 = new Error('');
    const child2 = new Error('');
    const agg = Object.assign(new AggregateError([child1, child2], ''), { code: 'ECONNREFUSED' });
    expect(normalizeConnectionError(agg)).toBe('ECONNREFUSED');
  });

  it('rien d\'exploitable → repli générique en français', () => {
    const err = new Error('');
    expect(normalizeConnectionError(err)).toBe('Connexion impossible (échec sans détail).');
  });

  it('err absent/null → repli générique en français', () => {
    expect(normalizeConnectionError(null)).toBe('Connexion impossible (échec sans détail).');
  });
});
