const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('api', {
  // Notebook operations
  notebooks: {
    getAll: (connId) => ipcRenderer.invoke('notebooks:getAll', connId),
    getById: (connId, id) => ipcRenderer.invoke('notebooks:getById', connId, id),
    create: (connId, name, icon) => ipcRenderer.invoke('notebooks:create', connId, name, icon),
    update: (connId, id, name, icon) => ipcRenderer.invoke('notebooks:update', connId, id, name, icon),
    delete: (connId, id) => ipcRenderer.invoke('notebooks:delete', connId, id),
    reorder: (connId, id, position) => ipcRenderer.invoke('notebooks:reorder', connId, id, position),
  },

  // Section operations
  sections: {
    getAll: (connId) => ipcRenderer.invoke('sections:getAll', connId),
    getByNotebook: (connId, notebookId) => ipcRenderer.invoke('sections:getByNotebook', connId, notebookId),
    getById: (connId, id) => ipcRenderer.invoke('sections:getById', connId, id),
    create: (connId, notebookId, title, color) => ipcRenderer.invoke('sections:create', connId, notebookId, title, color),
    update: (connId, id, title, color) => ipcRenderer.invoke('sections:update', connId, id, title, color),
    delete: (connId, id) => ipcRenderer.invoke('sections:delete', connId, id),
    reorder: (connId, id, position) => ipcRenderer.invoke('sections:reorder', connId, id, position),
    move: (connId, id, notebookId) => ipcRenderer.invoke('sections:move', connId, id, notebookId),
  },

  // Page operations
  pages: {
    getAll: (connId) => ipcRenderer.invoke('pages:getAll', connId),
    getBySection: (connId, sectionId) => ipcRenderer.invoke('pages:getBySection', connId, sectionId),
    getById: (connId, id) => ipcRenderer.invoke('pages:getById', connId, id),
    getFavorites: (connId) => ipcRenderer.invoke('pages:getFavorites', connId),
    create: (connId, sectionId, title) => ipcRenderer.invoke('pages:create', connId, sectionId, title),
    update: (connId, id, title) => ipcRenderer.invoke('pages:update', connId, id, title),
    toggleFavorite: (connId, id) => ipcRenderer.invoke('pages:toggleFavorite', connId, id),
    delete: (connId, id) => ipcRenderer.invoke('pages:delete', connId, id),
    reorder: (connId, id, position) => ipcRenderer.invoke('pages:reorder', connId, id, position),
    move: (connId, id, sectionId) => ipcRenderer.invoke('pages:move', connId, id, sectionId),
  },

  // Block operations
  blocks: {
    getByPage: (connId, pageId) => ipcRenderer.invoke('blocks:getByPage', connId, pageId),
    getById: (connId, id) => ipcRenderer.invoke('blocks:getById', connId, id),
    create: (connId, pageId, type, content, language, filename) =>
      ipcRenderer.invoke('blocks:create', connId, pageId, type, content, language, filename),
    update: (connId, id, content, language, title) => ipcRenderer.invoke('blocks:update', connId, id, content, language, title),
    delete: (connId, id) => ipcRenderer.invoke('blocks:delete', connId, id),
    reorder: (connId, id, position) => ipcRenderer.invoke('blocks:reorder', connId, id, position),
  },

  // Tag operations
  tags: {
    getAll: (connId) => ipcRenderer.invoke('tags:getAll', connId),
    getByPage: (connId, pageId) => ipcRenderer.invoke('tags:getByPage', connId, pageId),
    create: (connId, name, color) => ipcRenderer.invoke('tags:create', connId, name, color),
    addToPage: (connId, pageId, tagId) => ipcRenderer.invoke('tags:addToPage', connId, pageId, tagId),
    removeFromPage: (connId, pageId, tagId) => ipcRenderer.invoke('tags:removeFromPage', connId, pageId, tagId),
  },

  // Search operations
  search: {
    query: (connId, query) => ipcRenderer.invoke('search:query', connId, query),
  },

  // Dialog operations
  dialog: {
    prompt: (message, defaultValue) => ipcRenderer.invoke('dialog:prompt', message, defaultValue),
    chooseSqliteFile: () => ipcRenderer.invoke('dialog:chooseSqliteFile'),
    createSqliteFile: () => ipcRenderer.invoke('dialog:createSqliteFile'),
  },

  // Export operations
  export: {
    page: (connId, pageId, format, blockLayout) => ipcRenderer.invoke('export:page', connId, pageId, format, blockLayout),
    section: (connId, sectionId, format, blockLayout) => ipcRenderer.invoke('export:section', connId, sectionId, format, blockLayout),
    notebook: (connId, notebookId, format, blockLayout) => ipcRenderer.invoke('export:notebook', connId, notebookId, format, blockLayout),
    block: (connId, blockId, format) => ipcRenderer.invoke('export:block', connId, blockId, format),
  },

  // Shell operations
  shell: {
    openPath: (filePath) => ipcRenderer.invoke('shell:openPath', filePath),
    showItemInFolder: (filePath) => ipcRenderer.invoke('shell:showItemInFolder', filePath),
  },

  // Connection operations
  connections: {
    list: () => ipcRenderer.invoke('connections:list'),
    add: (cfg) => ipcRenderer.invoke('connections:add', cfg),
    update: (id, cfg) => ipcRenderer.invoke('connections:update', id, cfg),
    remove: (id) => ipcRenderer.invoke('connections:remove', id),
    test: (cfg) => ipcRenderer.invoke('connections:test', cfg),
    reconnect: (id) => ipcRenderer.invoke('connections:reconnect', id),
  },

  onConnectionStatusChanged: (cb) => {
    const listener = (_, payload) => cb(payload);
    ipcRenderer.on('connections:status-changed', listener);
    return () => ipcRenderer.removeListener('connections:status-changed', listener);
  },

  onOpenConnectionsModal: (cb) => {
    const listener = () => cb();
    ipcRenderer.on('ui:open-connections', listener);
    return () => ipcRenderer.removeListener('ui:open-connections', listener);
  },
});
