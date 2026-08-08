import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron';
import prompt from 'custom-electron-prompt';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  notebookOps,
  sectionOps,
  pageOps,
  blockOps,
  tagOps,
  searchOps,
} from './database.js';
import { manager } from './db/connection-manager.js';
import {
  listConnections, getConnectionForOpen, addConnection, updateConnection,
  removeConnection, migrateLegacyDbPath,
} from './settings.js';
import { exportOps } from './export.js';
import { SqliteAdapter } from './db/sqlite-adapter.js';
import { MySqlAdapter } from './db/mysql-adapter.js';
import { PostgresAdapter } from './db/postgres-adapter.js';

const TEST_ADAPTERS = { sqlite: SqliteAdapter, mysql: MySqlAdapter, postgres: PostgresAdapter };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    backgroundColor: '#1e1e1e',
    icon: path.join(app.getAppPath(), 'build/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.on('context-menu', (event, params) => {
    const menuItems = [];

    if (params.selectionText) {
      menuItems.push({
        label: 'Copier',
        role: 'copy',
        enabled: params.editFlags.canCopy,
      });
    }

    if (params.isEditable) {
      if (params.selectionText) {
        menuItems.push({ label: 'Couper', role: 'cut', enabled: params.editFlags.canCut });
      }
      menuItems.push({ label: 'Coller', role: 'paste', enabled: params.editFlags.canPaste });
    }

    if (params.selectionText || params.isEditable) {
      menuItems.push({ type: 'separator' });
      menuItems.push({ label: 'Sélectionner tout', role: 'selectAll' });
    }

    if (menuItems.length > 0) {
      Menu.buildFromTemplate(menuItems).popup({ window: mainWindow });
    }
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('Page failed to load:', errorCode, errorDescription, validatedURL);
    if (app.isPackaged) {
      const fallbackPath = path.join(app.getAppPath(), 'dist', 'index.html');
      console.error('Retrying with fallback path:', fallbackPath);
      mainWindow.loadFile(fallbackPath);
    }
  });

  // Load Vite dev server in development or built files in production
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    mainWindow.loadURL('http://localhost:5200');
  } else {
    mainWindow.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function setupApplicationMenu() {
  const template = [
    {
      label: 'Édition',
      submenu: [
        { role: 'undo', label: 'Annuler' },
        { role: 'redo', label: 'Rétablir' },
        { type: 'separator' },
        { role: 'cut', label: 'Couper' },
        { role: 'copy', label: 'Copier' },
        { role: 'paste', label: 'Coller' },
        { role: 'selectAll', label: 'Tout sélectionner' },
      ],
    },
    {
      label: 'Paramètres',
      submenu: [
        {
          label: 'Connexions aux bases de données...',
          click: () => mainWindow?.webContents.send('ui:open-connections'),
        },
      ],
    },
  ];

  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    });
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(async () => {
  migrateLegacyDbPath();

  manager.onStatusChange = (id, status) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('connections:status-changed', { id, ...status });
    }
  };

  setupApplicationMenu();
  createWindow();

  // Reconnexion automatique : toutes les connexions enregistrées, en parallèle.
  // Un échec laisse la connexion en statut error sans bloquer le démarrage.
  const configs = [];
  for (const c of listConnections()) {
    try {
      configs.push(getConnectionForOpen(c.id));
    } catch (err) {
      console.error(`Connexion ${c.id} illisible :`, err);
    }
  }
  manager.openAll(configs);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', async () => {
  await manager.closeAll();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

function toId(val) {
  const n = parseInt(val, 10);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`Invalid ID: ${val}`);
  return n;
}

function toPosition(val) {
  const n = parseInt(val, 10);
  if (!Number.isInteger(n) || n < 1) throw new Error(`Invalid position: ${val}`);
  return n;
}

// IPC Handlers for Notebooks
ipcMain.handle('notebooks:getAll', (_, connId) => notebookOps.getAll(connId));
ipcMain.handle('notebooks:getById', (_, connId, id) => notebookOps.getById(connId, toId(id)));
ipcMain.handle('notebooks:create', (_, connId, name, icon) => notebookOps.create(connId, name, icon));
ipcMain.handle('notebooks:update', (_, connId, id, name, icon) => notebookOps.update(connId, toId(id), name, icon));
ipcMain.handle('notebooks:delete', (_, connId, id) => notebookOps.delete(connId, toId(id)));
ipcMain.handle('notebooks:reorder', (_, connId, id, position) => notebookOps.reorder(connId, toId(id), toPosition(position)));

// IPC Handlers for Sections
ipcMain.handle('sections:getAll', (_, connId) => sectionOps.getAll(connId));
ipcMain.handle('sections:getByNotebook', (_, connId, notebookId) => sectionOps.getByNotebook(connId, toId(notebookId)));
ipcMain.handle('sections:getById', (_, connId, id) => sectionOps.getById(connId, toId(id)));
ipcMain.handle('sections:create', (_, connId, notebookId, title, color) => sectionOps.create(connId, toId(notebookId), title, color));
ipcMain.handle('sections:update', (_, connId, id, title, color) => sectionOps.update(connId, toId(id), title, color));
ipcMain.handle('sections:delete', (_, connId, id) => sectionOps.delete(connId, toId(id)));
ipcMain.handle('sections:reorder', (_, connId, id, position) => sectionOps.reorder(connId, toId(id), toPosition(position)));
ipcMain.handle('sections:move', (_, connId, id, notebookId) => sectionOps.move(connId, toId(id), toId(notebookId)));

// IPC Handlers for Pages
ipcMain.handle('pages:getAll', (_, connId) => pageOps.getAll(connId));
ipcMain.handle('pages:getBySection', (_, connId, sectionId) => pageOps.getBySection(connId, toId(sectionId)));
ipcMain.handle('pages:getById', (_, connId, id) => pageOps.getById(connId, toId(id)));
ipcMain.handle('pages:getFavorites', (_, connId) => pageOps.getFavorites(connId));
ipcMain.handle('pages:create', (_, connId, sectionId, title) => pageOps.create(connId, toId(sectionId), title));
ipcMain.handle('pages:update', (_, connId, id, title) => pageOps.update(connId, toId(id), title));
ipcMain.handle('pages:toggleFavorite', (_, connId, id) => pageOps.toggleFavorite(connId, toId(id)));
ipcMain.handle('pages:delete', (_, connId, id) => pageOps.delete(connId, toId(id)));
ipcMain.handle('pages:reorder', (_, connId, id, position) => pageOps.reorder(connId, toId(id), toPosition(position)));
ipcMain.handle('pages:move', (_, connId, id, sectionId) => pageOps.move(connId, toId(id), toId(sectionId)));

// IPC Handlers for Blocks
ipcMain.handle('blocks:getByPage', (_, connId, pageId) => blockOps.getByPage(connId, toId(pageId)));
ipcMain.handle('blocks:getById', (_, connId, id) => blockOps.getById(connId, toId(id)));
ipcMain.handle('blocks:create', (_, connId, pageId, type, content, language, filename) => blockOps.create(connId, toId(pageId), type, content, language, filename));
ipcMain.handle('blocks:update', (_, connId, id, content, language, title) => blockOps.update(connId, toId(id), content, language, title));
ipcMain.handle('blocks:delete', (_, connId, id) => blockOps.delete(connId, toId(id)));
ipcMain.handle('blocks:reorder', (_, connId, id, position) => blockOps.reorder(connId, toId(id), toPosition(position)));

// IPC Handlers for Tags
ipcMain.handle('tags:getAll', (_, connId) => tagOps.getAll(connId));
ipcMain.handle('tags:getByPage', (_, connId, pageId) => tagOps.getByPage(connId, toId(pageId)));
ipcMain.handle('tags:create', (_, connId, name, color) => tagOps.create(connId, name, color));
ipcMain.handle('tags:addToPage', (_, connId, pageId, tagId) => tagOps.addToPage(connId, toId(pageId), toId(tagId)));
ipcMain.handle('tags:removeFromPage', (_, connId, pageId, tagId) => tagOps.removeFromPage(connId, toId(pageId), toId(tagId)));

// IPC Handlers for Search
ipcMain.handle('search:query', (_, connId, query) => searchOps.search(connId, query));

// IPC Handlers for Export
ipcMain.handle('export:page', (_, connId, pageId, format, blockLayout) => exportOps.exportPage(connId, toId(pageId), format, blockLayout));
ipcMain.handle('export:section', (_, connId, sectionId, format, blockLayout) => exportOps.exportSection(connId, toId(sectionId), format, blockLayout));
ipcMain.handle('export:notebook', (_, connId, notebookId, format, blockLayout) => exportOps.exportNotebook(connId, toId(notebookId), format, blockLayout));
ipcMain.handle('export:block', (_, connId, blockId, format) => exportOps.exportBlock(connId, toId(blockId), format));

// IPC Handlers for Connections
ipcMain.handle('connections:list', () =>
  listConnections().map(c => ({ ...c, status: manager.status(c.id) }))
);

ipcMain.handle('connections:add', async (_, cfg) => {
  const saved = addConnection(cfg);
  manager.open(getConnectionForOpen(saved.id)).catch(() => {});
  return saved;
});

ipcMain.handle('connections:update', async (_, id, cfg) => {
  const saved = updateConnection(id, cfg);
  manager.open(getConnectionForOpen(id)).catch(() => {});
  return saved;
});

ipcMain.handle('connections:remove', async (_, id) => {
  await manager.close(id);
  removeConnection(id);
});

ipcMain.handle('connections:test', async (_, cfg) => {
  // Connexion éphémère : jamais enregistrée. Pour un update sans nouveau
  // mot de passe, cfg.id permet de reprendre le mot de passe stocké.
  const Adapter = TEST_ADAPTERS[cfg.type];
  if (!Adapter) return { ok: false, error: `Type inconnu : ${cfg.type}` };
  let password = cfg.password;
  if (!password && cfg.id) {
    try { password = getConnectionForOpen(cfg.id).password; } catch { /* config neuve */ }
  }
  const adapter = new Adapter({ ...cfg, password });
  try {
    await adapter.open();
    await adapter.close();
    return { ok: true };
  } catch (err) {
    await adapter.close().catch(() => {});
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('connections:reconnect', async (_, id) => {
  try {
    await manager.open(getConnectionForOpen(id));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('dialog:prompt', async (event, message, defaultValue = '') => {
  const result = await prompt({
    title: 'Input',
    label: message,
    value: defaultValue,
    type: 'input',
    mainWindow: mainWindow,
  });
  return result;
});

// IPC Handlers for Shell
ipcMain.handle('shell:openPath', (_, filePath) => shell.openPath(filePath));
ipcMain.handle('shell:showItemInFolder', (_, filePath) => shell.showItemInFolder(filePath));
