import { manager } from '../../electron/db/connection-manager.js';

let counter = 0;

// Ouvre une connexion sqlite in-memory (schéma appliqué par le manager)
// et retourne son connId.
export async function openTestConnection() {
  const id = `test-${++counter}`;
  await manager.open({ id, name: 'Test', type: 'sqlite', file: ':memory:' });
  return id;
}

export async function closeAllTestConnections() {
  await manager.closeAll();
}
