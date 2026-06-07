import { app, BrowserWindow, ipcMain, Menu, dialog } from 'electron';
import prompt from 'custom-electron-prompt';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  initDatabase,
  closeDatabase,
  notebookOps,
  sectionOps,
  pageOps,
  blockOps,
  tagOps,
  searchOps
} from './database.js';
import { getDbPath, setDbPath, getDefaultDbPath } from './settings.js';
import { exportOps } from './export.js';

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
  const currentPath = getDbPath() || getDefaultDbPath();
  const template = [
    {
      label: 'Paramètres',
      submenu: [
        {
          label: 'Choisir la base de données...',
          click: () => handleChooseDatabase(),
        },
        { type: 'separator' },
        {
          label: `Base actuelle : ${currentPath}`,
          enabled: false,
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

async function handleChooseDatabase() {
  const currentPath = getDbPath() || getDefaultDbPath();

  const { response: choice } = await dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Paramètres — Base de données',
    message: 'Base de données active',
    detail: `Chemin actuel :\n${currentPath}\n\nChoisissez une action :`,
    buttons: [
      'Sélectionner un fichier existant',
      'Créer un nouveau fichier',
      'Annuler',
    ],
    defaultId: 0,
    cancelId: 2,
  });

  if (choice === 2) return;

  let newDbPath = null;

  if (choice === 0) {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Sélectionner une base de données',
      defaultPath: currentPath,
      filters: [{ name: 'SQLite Database', extensions: ['sqlite', 'db'] }],
      properties: ['openFile'],
    });
    if (canceled || filePaths.length === 0) return;
    newDbPath = filePaths[0];
  } else {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Créer une nouvelle base de données',
      defaultPath: path.join(path.dirname(currentPath), 'netcodes-new.sqlite'),
      filters: [{ name: 'SQLite Database', extensions: ['sqlite'] }],
    });
    if (canceled || !filePath) return;
    newDbPath = filePath;
    if (!newDbPath.endsWith('.sqlite') && !newDbPath.endsWith('.db')) {
      newDbPath += '.sqlite';
    }
  }

  if (newDbPath === currentPath) {
    await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Aucun changement',
      message: 'Le fichier sélectionné est déjà la base de données active.',
    });
    return;
  }

  const { response: confirmed } = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    title: 'Confirmer le changement',
    message: 'Redémarrage nécessaire',
    detail: `La base de données va être changée pour :\n${newDbPath}\n\nL'application va redémarrer.`,
    buttons: ['Redémarrer maintenant', 'Annuler'],
    defaultId: 0,
    cancelId: 1,
  });

  if (confirmed === 1) return;

  setDbPath(newDbPath);
  app.relaunch();
  app.quit();
}

app.whenReady().then(() => {
  try {
    const savedDbPath = getDbPath();
    initDatabase(savedDbPath);
  } catch (err) {
    console.error('Database init failed:', err);
  }

  setupApplicationMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  closeDatabase();
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
ipcMain.handle('notebooks:getAll', () => notebookOps.getAll());
ipcMain.handle('notebooks:getById', (_, id) => notebookOps.getById(toId(id)));
ipcMain.handle('notebooks:create', (_, name, icon) => notebookOps.create(name, icon));
ipcMain.handle('notebooks:update', (_, id, name, icon) => notebookOps.update(toId(id), name, icon));
ipcMain.handle('notebooks:delete', (_, id) => notebookOps.delete(toId(id)));
ipcMain.handle('notebooks:reorder', (_, id, position) => notebookOps.reorder(toId(id), toPosition(position)));

// IPC Handlers for Sections
ipcMain.handle('sections:getAll', () => sectionOps.getAll());
ipcMain.handle('sections:getByNotebook', (_, notebookId) => sectionOps.getByNotebook(toId(notebookId)));
ipcMain.handle('sections:getById', (_, id) => sectionOps.getById(toId(id)));
ipcMain.handle('sections:create', (_, notebookId, title, color) => sectionOps.create(toId(notebookId), title, color));
ipcMain.handle('sections:update', (_, id, title, color) => sectionOps.update(toId(id), title, color));
ipcMain.handle('sections:delete', (_, id) => sectionOps.delete(toId(id)));
ipcMain.handle('sections:reorder', (_, id, position) => sectionOps.reorder(toId(id), toPosition(position)));
ipcMain.handle('sections:move', (_, id, notebookId) => sectionOps.move(toId(id), toId(notebookId)));

// IPC Handlers for Pages
ipcMain.handle('pages:getAll', () => pageOps.getAll());
ipcMain.handle('pages:getBySection', (_, sectionId) => pageOps.getBySection(toId(sectionId)));
ipcMain.handle('pages:getById', (_, id) => pageOps.getById(toId(id)));
ipcMain.handle('pages:getFavorites', () => pageOps.getFavorites());
ipcMain.handle('pages:create', (_, sectionId, title) => pageOps.create(toId(sectionId), title));
ipcMain.handle('pages:update', (_, id, title) => pageOps.update(toId(id), title));
ipcMain.handle('pages:toggleFavorite', (_, id) => pageOps.toggleFavorite(toId(id)));
ipcMain.handle('pages:delete', (_, id) => pageOps.delete(toId(id)));
ipcMain.handle('pages:reorder', (_, id, position) => pageOps.reorder(toId(id), toPosition(position)));
ipcMain.handle('pages:move', (_, id, sectionId) => pageOps.move(toId(id), toId(sectionId)));

// IPC Handlers for Blocks
ipcMain.handle('blocks:getByPage', (_, pageId) => blockOps.getByPage(toId(pageId)));
ipcMain.handle('blocks:getById', (_, id) => blockOps.getById(toId(id)));
ipcMain.handle('blocks:create', (_, pageId, type, content, language, filename) => blockOps.create(toId(pageId), type, content, language, filename));
ipcMain.handle('blocks:update', (_, id, content, language, title) => blockOps.update(toId(id), content, language, title));
ipcMain.handle('blocks:delete', (_, id) => blockOps.delete(toId(id)));
ipcMain.handle('blocks:reorder', (_, id, position) => blockOps.reorder(toId(id), toPosition(position)));

// IPC Handlers for Tags
ipcMain.handle('tags:getAll', () => tagOps.getAll());
ipcMain.handle('tags:getByPage', (_, pageId) => tagOps.getByPage(toId(pageId)));
ipcMain.handle('tags:create', (_, name, color) => tagOps.create(name, color));
ipcMain.handle('tags:addToPage', (_, pageId, tagId) => tagOps.addToPage(toId(pageId), toId(tagId)));

// IPC Handlers for Search
ipcMain.handle('search:query', (_, query) => searchOps.search(query));

// IPC Handlers for Export
ipcMain.handle('export:page', (_, pageId) => exportOps.exportPage(toId(pageId)));
ipcMain.handle('export:section', (_, sectionId) => exportOps.exportSection(toId(sectionId)));
ipcMain.handle('export:notebook', (_, notebookId) => exportOps.exportNotebook(toId(notebookId)));

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
