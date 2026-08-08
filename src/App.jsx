import React, { useState, useEffect, useCallback } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import Sidebar from './components/Sidebar';
import PagesList from './components/PagesList';
import EditorPanel from './components/EditorPanel';
import SearchModal from './components/SearchModal';
import MoveModal from './components/MoveModal';
import ExportModal from './components/ExportModal';
import ConnectionsModal from './components/ConnectionsModal';

function App() {
  // State for application data
  const [notebooks, setNotebooks] = useState([]);
  const [sections, setSections] = useState([]);
  const [pages, setPages] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [selectedNotebook, setSelectedNotebook] = useState(null);
  const [selectedSection, setSelectedSection] = useState(null);
  const [selectedPage, setSelectedPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showSearch, setShowSearch] = useState(false);
  const [moveModal, setMoveModal] = useState(null); // { mode: 'page'|'section', item }
  const [exportModal, setExportModal] = useState(null); // { mode: 'page'|'section'|'notebook'|'block', item }

  // State for multi-connection support
  const [connections, setConnections] = useState([]);
  const [showConnections, setShowConnections] = useState(false);

  // State for panel resizing
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const storedWidth = localStorage.getItem('sidebarWidth');
    return storedWidth ? parseInt(storedWidth, 10) : 250;
  });
  const [pagesListWidth, setPagesListWidth] = useState(() => {
    const storedWidth = localStorage.getItem('pagesListWidth');
    return storedWidth ? parseInt(storedWidth, 10) : 250;
  });
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [isResizingPagesList, setIsResizingPagesList] = useState(false);
  const [initialSidebarWidth, setInitialSidebarWidth] = useState(0);
  const [initialPagesListWidth, setInitialPagesListWidth] = useState(0);
  const [initialMouseX, setInitialMouseX] = useState(0);

  // Callback functions for resizing
  const startResizingSidebar = useCallback((e) => {
    setIsResizingSidebar(true);
    setInitialSidebarWidth(sidebarWidth);
    setInitialMouseX(e.clientX);
  }, [sidebarWidth]);

  const startResizingPagesList = useCallback((e) => {
    setIsResizingPagesList(true);
    setInitialPagesListWidth(pagesListWidth);
    setInitialMouseX(e.clientX);
  }, [pagesListWidth]);

  const stopResizing = useCallback(() => {
    setIsResizingSidebar(false);
    setIsResizingPagesList(false);
  }, []);

  const resizePanels = useCallback(
    (e) => {
      if (isResizingSidebar) {
        const newWidth = initialSidebarWidth + (e.clientX - initialMouseX);
        if (newWidth > 150 && newWidth < window.innerWidth - pagesListWidth - 200) {
          setSidebarWidth(newWidth);
          localStorage.setItem('sidebarWidth', newWidth);
        }
      } else if (isResizingPagesList) {
        const newWidth = initialPagesListWidth + (e.clientX - initialMouseX);
        if (newWidth > 150 && newWidth < window.innerWidth - sidebarWidth - 200) {
          setPagesListWidth(newWidth);
          localStorage.setItem('pagesListWidth', newWidth);
        }
      }
    },
    [isResizingSidebar, isResizingPagesList, initialSidebarWidth, initialPagesListWidth, initialMouseX, sidebarWidth, pagesListWidth]
  );

  // Effects for resizing event listeners
  useEffect(() => {
    window.addEventListener('mousemove', resizePanels);
    window.addEventListener('mouseup', stopResizing);
    return () => {
      window.removeEventListener('mousemove', resizePanels);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [resizePanels, stopResizing]);

  // Function to load initial data across every connected database.
  // Row ids are only unique WITHIN a connection, so every row loaded here is
  // tagged with the connId it came from — every downstream filter/find/API
  // call keys off that tag, never off the bare row id alone.
  const loadData = async () => {
    try {
      if (!window.api) throw new Error('Electron API not available');
      const conns = await window.api.connections.list();
      setConnections(conns);

      const connected = conns.filter(c => c.status.state === 'connected');
      // Each connection is fetched in its own try/catch: a single failing
      // database must never abort Promise.all and blank out every OTHER
      // connection's already-working data. A failure here yields empty
      // arrays for that connection alone (logged), while the rest load
      // normally.
      const perConn = await Promise.all(connected.map(async (c) => {
        try {
          const [nbs, secs, pgs] = await Promise.all([
            window.api.notebooks.getAll(c.id),
            window.api.sections.getAll(c.id),
            window.api.pages.getAll(c.id),
          ]);
          const tag = (rows) => rows.map(r => ({ ...r, connId: c.id }));
          return { notebooks: tag(nbs), sections: tag(secs), pages: tag(pgs) };
        } catch (error) {
          console.error(`Error loading data for connection ${c.id}:`, error);
          return { notebooks: [], sections: [], pages: [] };
        }
      }));

      const notebooksData = perConn.flatMap(d => d.notebooks);
      const sectionsData = perConn.flatMap(d => d.sections);
      const pagesData = perConn.flatMap(d => d.pages);
      setNotebooks(notebooksData);
      setSections(sectionsData);
      setPages(pagesData);

      // Restauration de la dernière page active : clé "<connId>:<pageId>"
      const lastKey = localStorage.getItem('lastActivePageKey');
      const lastPage = lastKey
        ? pagesData.find(p => `${p.connId}:${p.id}` === lastKey)
        : null;
      const lastSection = lastPage
        ? sectionsData.find(s => s.connId === lastPage.connId && s.id === lastPage.section_id)
        : null;
      const lastNotebook = lastSection
        ? notebooksData.find(n => n.connId === lastSection.connId && n.id === lastSection.notebook_id)
        : null;

      if (lastPage && lastSection && lastNotebook) {
        setSelectedNotebook(lastNotebook);
        setSelectedSection(lastSection);
        setSelectedPage(lastPage);
        const blocksData = await window.api.blocks.getByPage(lastPage.connId, lastPage.id);
        setBlocks(blocksData.map(b => ({ ...b, connId: lastPage.connId })));
      } else if (notebooksData.length > 0) {
        const first = notebooksData[0];
        setSelectedNotebook(first);
        const firstSection = sectionsData.find(s => s.connId === first.connId && s.notebook_id === first.id);
        if (firstSection) {
          setSelectedSection(firstSection);
          const firstPage = pagesData.find(p => p.connId === firstSection.connId && p.section_id === firstSection.id);
          if (firstPage) {
            setSelectedPage(firstPage);
            const blocksData = await window.api.blocks.getByPage(firstPage.connId, firstPage.id);
            setBlocks(blocksData.map(b => ({ ...b, connId: firstPage.connId })));
          }
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Effect to load initial data on component mount
  useEffect(() => {
    if (!window.api) {
      console.error('Electron API not available. Make sure preload script is loaded.');
      setLoading(false);
      return;
    }
    loadData();
  }, []);

  useEffect(() => {
    // Only persist when a page is actually selected — selectedPage is
    // transiently null on mount (while loadData is still fetching) and
    // when switching sections/notebooks, and we don't want those moments
    // to erase the remembered last-active page. Key is "<connId>:<pageId>"
    // since a bare page id is not unique across connections.
    if (selectedPage) {
      localStorage.setItem('lastActivePageKey', `${selectedPage.connId}:${selectedPage.id}`);
    }
  }, [selectedPage]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'k' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setShowSearch(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Subscribe to connection status changes (reload everything) and to the
  // main process asking us to open the connections manager (app menu, etc.)
  useEffect(() => {
    if (!window.api) return;
    const offStatus = window.api.onConnectionStatusChanged(() => { loadData(); });
    const offOpen = window.api.onOpenConnectionsModal(() => setShowConnections(true));
    return () => { offStatus(); offOpen(); };
  }, []);

  // Handlers for application logic
  const handleNotebookSelect = async (notebook, handleChildSelectection = false) => {
    setSelectedNotebook(notebook);
    const notebookSections = sections.filter(s => s.connId === notebook.connId && s.notebook_id === notebook.id);
    if (handleChildSelectection && notebookSections.length > 0) {
      await handleSectionSelect(notebookSections[0]);
    } else {
      setSelectedSection(null);
      setSelectedPage(null);
      setBlocks([]);
    }
  };

  const handleSectionSelect = async (section, handleChildSelectection = false) => {
    setSelectedSection(section);
    const notebook = await window.api.notebooks.getById(section.connId, section.notebook_id);
    setSelectedNotebook({ ...notebook, connId: section.connId });

    const sectionPages = pages.filter(p => p.connId === section.connId && p.section_id === section.id);
    if (handleChildSelectection && sectionPages.length > 0) {
      await handlePageSelect(sectionPages[0]);
    } else {
      setSelectedPage(null);
      setBlocks([]);
    }
  };

  const handlePageSelect = async (page) => {
    setSelectedPage(page);
    try {
      const section = await window.api.sections.getById(page.connId, page.section_id);
      setSelectedSection({ ...section, connId: page.connId });
      const notebook = await window.api.notebooks.getById(page.connId, section.notebook_id);
      setSelectedNotebook({ ...notebook, connId: page.connId });
      const blocksData = await window.api.blocks.getByPage(page.connId, page.id);
      setBlocks(blocksData.map(b => ({ ...b, connId: page.connId })));
    } catch (error) {
      console.error('Error loading page:', error);
    }
  };

  // Optional leading connId: used by the sidebar's per-connection "+" button
  // (Task 11). When omitted, targets the connection of the current
  // selection, falling back to the first connected database.
  const handleCreateNotebook = async (connId) => {
    const name = await window.api.dialog.prompt('Enter notebook name:');
    if (name) {
      try {
        const targetConnId = connId
          ?? selectedNotebook?.connId
          ?? connections.find(c => c.status.state === 'connected')?.id;
        if (!targetConnId) { alert('Aucune base connectée.'); return; }
        const idNoteBook = await window.api.notebooks.create(targetConnId, name, '📓');
        const notebook = await window.api.notebooks.getById(targetConnId, idNoteBook);
        await loadData();
        await handleNotebookSelect({ ...notebook, connId: targetConnId });
      } catch (error) {
        console.error('Error creating notebook:', error);
      }
    }
  };

  const handleCreateSection = async () => {
    if (!selectedNotebook) {
      alert('Please select a notebook first');
      return;
    }
    const title = await window.api.dialog.prompt('Enter section title:');
    if (title) {
      try {
        const connId = selectedNotebook.connId;
        const sectionId = await window.api.sections.create(connId, selectedNotebook.id, title, '#007bff');
        const section = await window.api.sections.getById(connId, sectionId);
        await loadData();
        await handleSectionSelect({ ...section, connId });
      } catch (error) {
        console.error('Error creating section:', error);
      }
    }
  };

  // Sidebar's notebook tree spans every connection at once, so there is no
  // single "current" connId to infer this from — the caller must supply it.
  // (Sidebar itself still calls this with a bare id until Task 11 updates it.)
  const handleUpdateNotebook = async (connId, notebookId, newName, newIcon) => {
    try {
      await window.api.notebooks.update(connId, notebookId, newName, newIcon);
      await loadData();
      setSelectedNotebook(prevNotebook =>
        prevNotebook && prevNotebook.connId === connId && prevNotebook.id === notebookId
          ? { ...prevNotebook, name: newName, icon: newIcon }
          : prevNotebook
      );
    } catch (error) {
      console.error('Error updating notebook name:', error);
    }
  };

  const handleDeleteNotebook = async (connId, notebookId) => {
    if (window.confirm('Are you sure you want to delete this notebook? All sections and pages inside will also be deleted.')) {
      try {
        await window.api.notebooks.delete(connId, notebookId);
        await loadData();
        if (selectedNotebook?.connId === connId && selectedNotebook?.id === notebookId) {
          setSelectedNotebook(null);
          setSelectedSection(null);
          setSelectedPage(null);
          setBlocks([]);
        }
      } catch (error) {
        console.error('Error deleting notebook:', error);
      }
    }
  };

  const handleReorderNotebook = async (connId, notebookId, newPosition) => {
    try {
      const connNotebooks = notebooks.filter(n => n.connId === connId).sort((a, b) => a.position - b.position);
      const currentIndex = connNotebooks.findIndex(n => n.id === notebookId);

      if (currentIndex !== -1 && currentIndex !== newPosition && newPosition >= 0 && newPosition < connNotebooks.length) {
        const reorderedList = [...connNotebooks];
        const [movedItem] = reorderedList.splice(currentIndex, 1);
        reorderedList.splice(newPosition, 0, movedItem);

        // Reorder all notebooks of this connection with new sequential positions
        for (let i = 0; i < reorderedList.length; i++) {
          await window.api.notebooks.reorder(connId, reorderedList[i].id, i + 1);
        }
      }

      const updatedNotebooks = await window.api.notebooks.getAll(connId);
      const tagged = updatedNotebooks.map(n => ({ ...n, connId }));
      // Replace only this connection's slice — other connections' notebooks
      // are untouched and must not be dropped from state.
      setNotebooks(prev => [...prev.filter(n => n.connId !== connId), ...tagged]);
    } catch (error) {
      console.error('Error reordering notebook:', error);
    }
  };

  const handleReorderSection = async (connId, sectionId, newPosition) => {
    try {
      const currentSection = sections.find(s => s.connId === connId && s.id === sectionId);
      if (!currentSection) return;

      const notebookSections = sections
        .filter(s => s.connId === connId && s.notebook_id === currentSection.notebook_id)
        .sort((a, b) => a.position - b.position);

      const currentIndex = notebookSections.findIndex(s => s.id === sectionId);

      if (currentIndex !== -1 && currentIndex !== newPosition && newPosition >= 0 && newPosition < notebookSections.length) {
        const reorderedList = [...notebookSections];
        const [movedItem] = reorderedList.splice(currentIndex, 1);
        reorderedList.splice(newPosition, 0, movedItem);

        // Reorder all sections with new sequential positions
        for (let i = 0; i < reorderedList.length; i++) {
          await window.api.sections.reorder(connId, reorderedList[i].id, i + 1);
        }
      }

      const updatedSections = await window.api.sections.getAll(connId);
      const tagged = updatedSections.map(s => ({ ...s, connId }));
      setSections(prev => [...prev.filter(s => s.connId !== connId), ...tagged]);
    } catch (error) {
      console.error('Error reordering section:', error);
    }
  };

  // Pages under a section are always scoped to that section's connection
  // (PagesList only ever shows selectedSection's own pages), so the
  // reorder target's connId comes straight from the current selection.
  const handleReorderPage = async (pageId, newPosition) => {
    try {
      const connId = selectedSection?.connId;
      if (!connId) return;
      const currentPage = pages.find(p => p.connId === connId && p.id === pageId);
      if (!currentPage) return;

      const sectionPages = pages
        .filter(p => p.connId === connId && p.section_id === currentPage.section_id)
        .sort((a, b) => a.position - b.position);

      const currentIndex = sectionPages.findIndex(p => p.id === pageId);

      if (currentIndex !== -1 && currentIndex !== newPosition && newPosition >= 0 && newPosition < sectionPages.length) {
        const reorderedList = [...sectionPages];
        const [movedItem] = reorderedList.splice(currentIndex, 1);
        reorderedList.splice(newPosition, 0, movedItem);

        for (let i = 0; i < reorderedList.length; i++) {
          await window.api.pages.reorder(connId, reorderedList[i].id, i + 1);
        }
      }

      const updatedPages = await window.api.pages.getAll(connId);
      const tagged = updatedPages.map(p => ({ ...p, connId }));
      setPages(prev => [...prev.filter(p => p.connId !== connId), ...tagged]);
    } catch (error) {
      console.error('Error reordering page:', error);
    }
  };

  // Same rationale as handleUpdateNotebook: sections are shown across every
  // expanded notebook (any connection) in the sidebar tree at once.
  const handleUpdateSection = async (connId, sectionId, newTitle, newColor) => {
    try {
      await window.api.sections.update(connId, sectionId, newTitle, newColor);
      await loadData();
      setSelectedSection(prevSection =>
        prevSection && prevSection.connId === connId && prevSection.id === sectionId
          ? { ...prevSection, title: newTitle, color: newColor }
          : prevSection
      );
    } catch (error) {
      console.error('Error updating section title:', error);
    }
  };

  const handleDeleteSection = async (connId, sectionId) => {
    if (window.confirm('Are you sure you want to delete this section? All pages inside will also be deleted.')) {
      try {
        const section = await window.api.sections.getById(connId, sectionId);
        const notebook = await window.api.notebooks.getById(connId, section.notebook_id);
        await window.api.sections.delete(connId, sectionId);
        await loadData();
        await handleNotebookSelect({ ...notebook, connId });

        if (selectedSection?.connId === connId && selectedSection?.id === sectionId) {
          setSelectedSection(null);
          setSelectedPage(null);
          setBlocks([]);
        }
      } catch (error) {
        console.error('Error deleting section:', error);
      }
    }
  };

  const handleCreatePage = async () => {
    if (!selectedSection) {
      alert('Please select a section first');
      return;
    }
    const title = await window.api.dialog.prompt('Enter page title:');
    if (title) {
      try {
        const connId = selectedSection.connId;
        const id = await window.api.pages.create(connId, selectedSection.id, title);
        const newPage = await window.api.pages.getById(connId, id);
        await loadData();
        const section = await window.api.sections.getById(connId, newPage.section_id);
        await handleSectionSelect({ ...section, connId }, true);
        await handlePageSelect({ ...newPage, connId });
        setBlocks([]);
      } catch (error) {
        console.error('Error creating page:', error);
      }
    }
  };

  // Pages listed/renamed/deleted from PagesList or EditorPanel always belong
  // to selectedSection (PagesList is pre-filtered to it), so that connId is
  // reliable context — no ambiguous cross-connection id lookup needed.
  const handleDeletePage = async (pageId) => {
    if (window.confirm('Are you sure you want to delete this page?')) {
      try {
        const connId = selectedSection?.connId ?? selectedPage?.connId;
        if (!connId) return;
        const page = await window.api.pages.getById(connId, pageId);
        const section = await window.api.sections.getById(connId, page.section_id);
        await window.api.pages.delete(connId, pageId);
        await loadData();
        await handleSectionSelect({ ...section, connId }, true);
        if (selectedPage?.connId === connId && selectedPage?.id === pageId) {
          setSelectedPage(null);
          setBlocks([]);
        }
      } catch (error) {
        console.error('Error deleting page:', error);
      }
    }
  };

  const handleUpdatePageTitle = async (pageId, newTitle) => {
    try {
      const connId = selectedSection?.connId ?? selectedPage?.connId;
      if (!connId) return;
      await window.api.pages.update(connId, pageId, newTitle);
      await loadData();
      setSelectedPage(prevPage =>
        prevPage && prevPage.connId === connId && prevPage.id === pageId
          ? { ...prevPage, title: newTitle }
          : prevPage
      );
    } catch (error) {
      console.error('Error updating page title:', error);
    }
  };

  // Called only from this file's own JSX (MoveModal's onMove), so the
  // moved item's connId is always directly available — no inference needed.
  const handleMovePage = async (connId, pageId, newSectionId) => {
    try {
      await window.api.pages.move(connId, pageId, newSectionId);
      const updatedPages = await window.api.pages.getAll(connId);
      const tagged = updatedPages.map(p => ({ ...p, connId }));
      setPages(prev => [...prev.filter(p => p.connId !== connId), ...tagged]);
      if (selectedPage?.connId === connId && selectedPage?.id === pageId) {
        const movedPage = tagged.find(p => p.id === pageId);
        if (movedPage) await handlePageSelect(movedPage);
      }
    } catch (error) {
      console.error('Error moving page:', error);
    }
  };

  const handleMoveSection = async (connId, sectionId, newNotebookId) => {
    try {
      await window.api.sections.move(connId, sectionId, newNotebookId);
      const updatedSections = await window.api.sections.getAll(connId);
      const tagged = updatedSections.map(s => ({ ...s, connId }));
      setSections(prev => [...prev.filter(s => s.connId !== connId), ...tagged]);
      if (selectedSection?.connId === connId && selectedSection?.id === sectionId) {
        const movedSection = tagged.find(s => s.id === sectionId);
        if (movedSection) await handleSectionSelect(movedSection);
      }
    } catch (error) {
      console.error('Error moving section:', error);
    }
  };

  // Receives the full page object (not just the id) so its connId travels
  // with it — PagesList still calls this with a bare id today, which will
  // be fixed when it is adapted to the multi-connection props.
  const handleToggleFavorite = async (page) => {
    try {
      await window.api.pages.toggleFavorite(page.connId, page.id);
      // Reload everything, preserving the current selection via
      // lastActivePageKey (persisted by the effect below on every
      // selectedPage change).
      await loadData();
    } catch (error) {
      console.error('Error toggling favorite:', error);
    }
  };

  const handleCreateBlock = async (type) => {
    if (!selectedPage) {
      alert('Please select a page first');
      return;
    }
    try {
      const connId = selectedPage.connId;
      const content = type === 'text' ? '# New Text Block\n\nStart typing...' : '// Write your code here';
      const language = type === 'code' ? 'javascript' : null;
      const title = null; // New blocks start with no title
      await window.api.blocks.create(connId, selectedPage.id, type, content, language, null, title);
      const blocksData = await window.api.blocks.getByPage(connId, selectedPage.id);
      setBlocks(blocksData.map(b => ({ ...b, connId })));
    } catch (error) {
      console.error('Error creating block:', error);
    }
  };

  // Blocks are always scoped to selectedPage — the blocks array in state
  // never mixes pages/connections, so selectedPage.connId is reliable here.
  const handleUpdateBlock = async (blockId, content, language, title) => {
    try {
      const connId = selectedPage.connId;
      await window.api.blocks.update(connId, blockId, content, language, title);
      const blocksData = await window.api.blocks.getByPage(connId, selectedPage.id);
      setBlocks(blocksData.map(b => ({ ...b, connId })));
    } catch (error) {
      console.error('Error updating block:', error);
    }
  };

  const handleDeleteBlock = async (blockId) => {
    if (window.confirm('Are you sure you want to delete this block?')) {
      try {
        const connId = selectedPage.connId;
        await window.api.blocks.delete(connId, blockId);
        const blocksData = await window.api.blocks.getByPage(connId, selectedPage.id);
        setBlocks(blocksData.map(b => ({ ...b, connId })));
      } catch (error) {
        console.error('Error deleting block:', error);
      }
    }
  };

  const handleReorderBlock = async (blockId, newPosition) => {
    try {
      const connId = selectedPage.connId;
      // blocks state is always the set for selectedPage alone (single
      // connection), so no additional connId filter is needed here.
      const allBlocks = [...blocks].sort((a, b) => a.position - b.position);
      const currentIndex = allBlocks.findIndex(b => b.id === blockId);

      if (currentIndex !== -1 && currentIndex !== newPosition - 1 && newPosition > 0 && newPosition <= allBlocks.length) {
        const reorderedList = [...allBlocks];
        const [movedItem] = reorderedList.splice(currentIndex, 1);
        reorderedList.splice(newPosition - 1, 0, movedItem);

        // Update all blocks with new sequential positions
        for (let i = 0; i < reorderedList.length; i++) {
          await window.api.blocks.reorder(connId, reorderedList[i].id, i + 1);
        }
      }

      const blocksData = await window.api.blocks.getByPage(connId, selectedPage.id);
      setBlocks(blocksData.map(b => ({ ...b, connId })));
    } catch (error) {
      console.error('Error reordering block:', error);
    }
  };

  // Conditional rendering based on loading state or Electron API availability
  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ height: '100vh' }}>
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  if (!window.api) {
    return (
      <div className="d-flex justify-content-center align-items-center flex-column" style={{ height: '100vh' }}>
        <i className="bi bi-exclamation-triangle text-danger" style={{ fontSize: '4rem' }}></i>
        <h3 className="mt-3">Electron API Not Available</h3>
        <p className="text-muted">Please make sure you're running the app with Electron.</p>
        <p className="text-muted">Run: <code>npm run electron:dev</code></p>
      </div>
    );
  }

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="app-container">
        <Sidebar
          notebooks={notebooks}
          sections={sections}
          pages={pages}
          connections={connections}
          selectedNotebook={selectedNotebook}
          selectedSection={selectedSection}
          onNotebookSelect={handleNotebookSelect}
          onSectionSelect={handleSectionSelect}
          onCreateNotebook={handleCreateNotebook}
          onNotebookCreateInConnection={handleCreateNotebook}
          onCreateSection={handleCreateSection}
          onDeleteNotebook={handleDeleteNotebook}
          onDeleteSection={handleDeleteSection}
          onUpdateNotebook={handleUpdateNotebook}
          onUpdateSection={handleUpdateSection}
          onReorderNotebook={handleReorderNotebook}
          onReorderSection={handleReorderSection}
          onMoveSection={(section) => setMoveModal({ mode: 'section', item: section })}
          onExportNotebook={(notebook) => setExportModal({ mode: 'notebook', item: notebook })}
          onExportSection={(section) => setExportModal({ mode: 'section', item: section })}
          onOpenSearch={() => setShowSearch(true)}
          style={{ width: sidebarWidth }}
        />
        <div className="resizer" onMouseDown={startResizingSidebar}></div>
        <PagesList
          pages={pages.filter(p => selectedSection ? (p.connId === selectedSection.connId && p.section_id === selectedSection.id) : false)}
          selectedPage={selectedPage}
          onPageSelect={handlePageSelect}
          onCreatePage={handleCreatePage}
          onDeletePage={handleDeletePage}
          onRenamePage={handleUpdatePageTitle}
          onToggleFavorite={handleToggleFavorite}
          onReorderPage={handleReorderPage}
          onMovePage={(page) => setMoveModal({ mode: 'page', item: page })}
          onExportPage={(page) => setExportModal({ mode: 'page', item: page })}
          style={{ width: pagesListWidth }}
        />
        <div className="resizer" onMouseDown={startResizingPagesList}></div>
        <EditorPanel
          page={selectedPage}
          blocks={blocks}
          onCreateBlock={handleCreateBlock}
          onUpdateBlock={handleUpdateBlock}
          onDeleteBlock={handleDeleteBlock}
          onUpdatePageTitle={handleUpdatePageTitle}
          onReorderBlock={handleReorderBlock}
          onExportPage={selectedPage ? () => setExportModal({ mode: 'page', item: selectedPage }) : null}
          onExportBlock={(block) => setExportModal({ mode: 'block', item: block })}
          style={{ flexGrow: 1 }}
        />
      </div>
      {showSearch && (
        <SearchModal
          connections={connections}
          defaultConnId={selectedPage?.connId ?? selectedNotebook?.connId ?? connections.find(c => c.status.state === 'connected')?.id}
          onClose={() => setShowSearch(false)}
          onNotebookSelect={(notebook) => { handleNotebookSelect(notebook); setShowSearch(false); }}
          onSectionSelect={(section) => { handleSectionSelect(section); setShowSearch(false); }}
          onPageSelect={(page) => { handlePageSelect(page); setShowSearch(false); }}
        />
      )}
      {moveModal && (
        <MoveModal
          mode={moveModal.mode}
          itemName={moveModal.item.title ?? moveModal.item.name}
          notebooks={notebooks.filter(n => n.connId === moveModal.item.connId)}
          sections={sections.filter(s => s.connId === moveModal.item.connId &&
            (moveModal.mode === 'page' ? s.id !== moveModal.item.section_id : s.notebook_id !== moveModal.item.id))}
          onMove={(destId) => {
            if (moveModal.mode === 'page') handleMovePage(moveModal.item.connId, moveModal.item.id, destId);
            else handleMoveSection(moveModal.item.connId, moveModal.item.id, destId);
          }}
          onClose={() => setMoveModal(null)}
        />
      )}
      {exportModal && (
        <ExportModal
          mode={exportModal.mode}
          item={exportModal.item}
          connId={exportModal.item.connId}
          notebooks={notebooks}
          sections={sections}
          pages={pages}
          onClose={() => setExportModal(null)}
        />
      )}
      {showConnections && (
        <ConnectionsModal
          connections={connections}
          onClose={() => setShowConnections(false)}
          onChanged={loadData}
        />
      )}
    </DndProvider>
  );
}

export default App;
