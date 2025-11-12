import { app, BrowserWindow, ipcMain } from 'electron';
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
  tagOps
} from './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Load Vite dev server in development or built files in production
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    mainWindow.loadURL('http://localhost:5200');
    // mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // Initialize database
  initDatabase();

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

// IPC Handlers for Notebooks
ipcMain.handle('notebooks:getAll', () => notebookOps.getAll());
ipcMain.handle('notebooks:getById', (_, id) => notebookOps.getById(id));
ipcMain.handle('notebooks:create', (_, name, icon) => notebookOps.create(name, icon));
ipcMain.handle('notebooks:update', (_, id, name, icon) => notebookOps.update(id, name, icon));
ipcMain.handle('notebooks:delete', (_, id) => notebookOps.delete(id));
ipcMain.handle('notebooks:reorder', (_, id, position) => notebookOps.reorder(id, position));

// IPC Handlers for Sections
ipcMain.handle('sections:getAll', () => sectionOps.getAll());
ipcMain.handle('sections:getByNotebook', (_, notebookId) => sectionOps.getByNotebook(notebookId));
ipcMain.handle('sections:getById', (_, id) => sectionOps.getById(id));
ipcMain.handle('sections:create', (_, notebookId, title, color) => sectionOps.create(notebookId, title, color));
ipcMain.handle('sections:update', (_, id, title, color) => sectionOps.update(id, title, color));
ipcMain.handle('sections:delete', (_, id) => sectionOps.delete(id));
ipcMain.handle('sections:reorder', (_, id, position) => sectionOps.reorder(id, position));

// IPC Handlers for Pages
ipcMain.handle('pages:getAll', () => pageOps.getAll());
ipcMain.handle('pages:getBySection', (_, sectionId) => pageOps.getBySection(sectionId));
ipcMain.handle('pages:getById', (_, id) => pageOps.getById(id));
ipcMain.handle('pages:getFavorites', () => pageOps.getFavorites());
ipcMain.handle('pages:create', (_, sectionId, title) => pageOps.create(sectionId, title));
ipcMain.handle('pages:update', (_, id, title) => pageOps.update(id, title));
ipcMain.handle('pages:toggleFavorite', (_, id) => pageOps.toggleFavorite(id));
ipcMain.handle('pages:delete', (_, id) => pageOps.delete(id));
ipcMain.handle('pages:reorder', (_, id, position) => pageOps.reorder(id, position));

// IPC Handlers for Blocks
ipcMain.handle('blocks:getByPage', (_, pageId) => blockOps.getByPage(pageId));
ipcMain.handle('blocks:getById', (_, id) => blockOps.getById(id));
ipcMain.handle('blocks:create', (_, pageId, type, content, language, filename) =>
  blockOps.create(pageId, type, content, language, filename));
ipcMain.handle('blocks:update', (_, id, content, language) => blockOps.update(id, content, language));
ipcMain.handle('blocks:delete', (_, id) => blockOps.delete(id));
ipcMain.handle('blocks:reorder', (_, id, position) => blockOps.reorder(id, position));

// IPC Handlers for Tags
ipcMain.handle('tags:getAll', () => tagOps.getAll());
ipcMain.handle('tags:getByPage', (_, pageId) => tagOps.getByPage(pageId));
ipcMain.handle('tags:create', (_, name, color) => tagOps.create(name, color));
ipcMain.handle('tags:addToPage', (_, pageId, tagId) => tagOps.addToPage(pageId, tagId));


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
