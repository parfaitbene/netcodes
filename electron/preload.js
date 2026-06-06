const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('api', {
  // Notebook operations
  notebooks: {
    getAll: () => ipcRenderer.invoke('notebooks:getAll'),
    getById: (id) => ipcRenderer.invoke('notebooks:getById', id),
    create: (name, icon) => ipcRenderer.invoke('notebooks:create', name, icon),
    update: (id, name, icon) => ipcRenderer.invoke('notebooks:update', id, name, icon),
    delete: (id) => ipcRenderer.invoke('notebooks:delete', id),
    reorder: (id, position) => ipcRenderer.invoke('notebooks:reorder', id, position),
  },

  // Section operations
  sections: {
    getAll: () => ipcRenderer.invoke('sections:getAll'),
    getByNotebook: (notebookId) => ipcRenderer.invoke('sections:getByNotebook', notebookId),
    getById: (id) => ipcRenderer.invoke('sections:getById', id),
    create: (notebookId, title, color) => ipcRenderer.invoke('sections:create', notebookId, title, color),
    update: (id, title, color) => ipcRenderer.invoke('sections:update', id, title, color),
    delete: (id) => ipcRenderer.invoke('sections:delete', id),
    reorder: (id, position) => ipcRenderer.invoke('sections:reorder', id, position),
    move: (id, notebookId) => ipcRenderer.invoke('sections:move', id, notebookId),
  },

  // Page operations
  pages: {
    getAll: () => ipcRenderer.invoke('pages:getAll'),
    getBySection: (sectionId) => ipcRenderer.invoke('pages:getBySection', sectionId),
    getById: (id) => ipcRenderer.invoke('pages:getById', id),
    getFavorites: () => ipcRenderer.invoke('pages:getFavorites'),
    create: (sectionId, title) => ipcRenderer.invoke('pages:create', sectionId, title),
    update: (id, title) => ipcRenderer.invoke('pages:update', id, title),
    toggleFavorite: (id) => ipcRenderer.invoke('pages:toggleFavorite', id),
    delete: (id) => ipcRenderer.invoke('pages:delete', id),
    reorder: (id, position) => ipcRenderer.invoke('pages:reorder', id, position),
    move: (id, sectionId) => ipcRenderer.invoke('pages:move', id, sectionId),
  },

  // Block operations
  blocks: {
    getByPage: (pageId) => ipcRenderer.invoke('blocks:getByPage', pageId),
    getById: (id) => ipcRenderer.invoke('blocks:getById', id),
    create: (pageId, type, content, language, filename) =>
      ipcRenderer.invoke('blocks:create', pageId, type, content, language, filename),
    update: (id, content, language, title) => ipcRenderer.invoke('blocks:update', id, content, language, title),
    delete: (id) => ipcRenderer.invoke('blocks:delete', id),
    reorder: (id, position) => ipcRenderer.invoke('blocks:reorder', id, position),
  },

  // Tag operations
  tags: {
    getAll: () => ipcRenderer.invoke('tags:getAll'),
    getByPage: (pageId) => ipcRenderer.invoke('tags:getByPage', pageId),
    create: (name, color) => ipcRenderer.invoke('tags:create', name, color),
    addToPage: (pageId, tagId) => ipcRenderer.invoke('tags:addToPage', pageId, tagId),
    removeFromPage: (pageId, tagId) => ipcRenderer.invoke('tags:removeFromPage', pageId, tagId),
  },

  // Search operations
  search: {
    query: (query) => ipcRenderer.invoke('search:query', query),
  },

  // Dialog operations
  dialog: {
    prompt: (message, defaultValue) => ipcRenderer.invoke('dialog:prompt', message, defaultValue),
  },
});
