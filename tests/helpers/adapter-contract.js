import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// Suite exécutée à l'identique sur chaque adaptateur.
// makeAdapter: () => Promise<DbAdapter> (déjà open()).
// itemsDdl: DDL de la table de test dans le dialecte de l'adaptateur.
export function adapterContract(name, { makeAdapter, itemsDdl, enabled = true }) {
  const d = enabled ? describe : describe.skip;
  d(`adapter contract: ${name}`, () => {
    let a;

    beforeEach(async () => {
      a = await makeAdapter();
      await a.exec('DROP TABLE IF EXISTS items');
      await a.exec(itemsDdl);
    });

    afterEach(async () => {
      if (a) {
        await a.exec('DROP TABLE IF EXISTS items');
        await a.close();
        a = null;
      }
    });

    it('insert retourne un id auto-généré croissant', async () => {
      const id1 = await a.insert('INSERT INTO items (name, qty) VALUES (?, ?)', ['a', 1]);
      const id2 = await a.insert('INSERT INTO items (name, qty) VALUES (?, ?)', ['b', 2]);
      expect(typeof id1).toBe('number');
      expect(id2).toBeGreaterThan(id1);
    });

    it('get et all avec placeholders ?', async () => {
      await a.insert('INSERT INTO items (name, qty) VALUES (?, ?)', ['x', 10]);
      await a.insert('INSERT INTO items (name, qty) VALUES (?, ?)', ['y', 20]);
      const row = await a.get('SELECT name, qty FROM items WHERE name = ?', ['x']);
      expect(row.qty).toBe(10);
      const rows = await a.all('SELECT name FROM items WHERE qty > ? ORDER BY qty', [5]);
      expect(rows.map(r => r.name)).toEqual(['x', 'y']);
      expect(await a.get('SELECT 1 AS one FROM items WHERE name = ?', ['zzz'])).toBeUndefined();
    });

    it('run retourne le nombre de lignes modifiées', async () => {
      await a.insert('INSERT INTO items (name, qty) VALUES (?, ?)', ['x', 1]);
      await a.insert('INSERT INTO items (name, qty) VALUES (?, ?)', ['y', 1]);
      const r = await a.run('UPDATE items SET qty = ? WHERE qty = ?', [5, 1]);
      expect(r.changes).toBe(2);
    });

    it('transaction commit', async () => {
      await a.transaction(async (tx) => {
        await tx.insert('INSERT INTO items (name, qty) VALUES (?, ?)', ['t', 1]);
      });
      expect((await a.all('SELECT * FROM items')).length).toBe(1);
    });

    it('transaction rollback sur erreur', async () => {
      await expect(a.transaction(async (tx) => {
        await tx.insert('INSERT INTO items (name, qty) VALUES (?, ?)', ['t', 1]);
        throw new Error('boom');
      })).rejects.toThrow('boom');
      expect((await a.all('SELECT * FROM items')).length).toBe(0);
    });
  });
}
