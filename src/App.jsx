import React, { useState, useEffect, useCallback } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import Sidebar from './components/Sidebar';
import PagesList from './components/PagesList';
import EditorPanel from './components/EditorPanel';

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

  // Function to load initial data
  const loadData = async () => {
    try {
      if (!window.api) {
        throw new Error('Electron API not available');
      }
      const notebooksData = await window.api.notebooks.getAll();
      const sectionsData = await window.api.sections.getAll();
      const pagesData = await window.api.pages.getAll();

      setNotebooks(notebooksData);
      setSections(sectionsData);
      setPages(pagesData);

      // Auto-select first notebook and section if available
      if (notebooksData.length > 0) {
        setSelectedNotebook(notebooksData[0]);
        const firstSection = sectionsData.find(s => s.notebook_id === notebooksData[0].id);
        if (firstSection) {
          setSelectedSection(firstSection);
          const firstPage = pagesData.find(p => p.section_id === firstSection.id);
          if (firstPage) {
            setSelectedPage(firstPage);
            const blocksData = await window.api.blocks.getByPage(firstPage.id);
            setBlocks(blocksData);
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

  // Handlers for application logic
  const handleNotebookSelect = async (notebook, handleChildSelectection = false) => {
    setSelectedNotebook(notebook);
    const notebookSections = sections.filter(s => s.notebook_id === notebook.id);
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
    const notebook = await window.api.notebooks.getById(section.notebook_id);
      setSelectedNotebook(notebook);

    const sectionPages = pages.filter(p => p.section_id === section.id);
    if (handleChildSelectection && sectionPages.length > 0) {
      await handlePageSelect(sectionPages[0]);
    } else {
      setSelectedPage(null);
      setBlocks([]);
    }
  };

  const handlePageSelect = async (page, ) => {
    setSelectedPage(page);
    const section = await window.api.sections.getById(page.section_id);
      setSelectedSection(section);

    try {
      const blocksData = await window.api.blocks.getByPage(page.id);
      setBlocks(blocksData);
    } catch (error) {
      console.error('Error loading blocks:', error);
    }
  };

  const handleCreateNotebook = async () => {
    const name = await window.api.dialog.prompt('Enter notebook name:');
    if (name) {
      try {
        const idNoteBook = await window.api.notebooks.create(name, '📓');
        const notebook = await window.api.notebooks.getById(idNoteBook);
        await loadData();
        await handleNotebookSelect(notebook);
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
        const sectionId = await window.api.sections.create(selectedNotebook.id, title, '#007bff');
        const section = await window.api.sections.getById(sectionId);
        await loadData();
        await handleSectionSelect(section);
      } catch (error) {
        console.error('Error creating section:', error);
      }
    }
  };

  const handleUpdateNotebook = async (notebookId, newName, newIcon) => {
    try {
      await window.api.notebooks.update(notebookId, newName, newIcon);
      await loadData();
      setSelectedNotebook(prevNotebook =>
        prevNotebook && prevNotebook.id === notebookId ? { ...prevNotebook, name: newName, icon: newIcon } : prevNotebook
      );
    } catch (error) {
      console.error('Error updating notebook name:', error);
    }
  };

  const handleDeleteNotebook = async (notebookId) => {
    if (window.confirm('Are you sure you want to delete this notebook? All sections and pages inside will also be deleted.')) {
      try {
        await window.api.notebooks.delete(notebookId);
        await loadData();
        if (selectedNotebook?.id === notebookId) {
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

  const handleUpdateSection = async (sectionId, newTitle, newColor) => {
    try {
      await window.api.sections.update(sectionId, newTitle, newColor);
      await loadData();
      setSelectedSection(prevSection =>
        prevSection && prevSection.id === sectionId ? { ...prevSection, title: newTitle, color: newColor } : prevSection
      );
    } catch (error) {
      console.error('Error updating section title:', error);
    }
  };

  const handleDeleteSection = async (sectionId) => {
    if (window.confirm('Are you sure you want to delete this section? All pages inside will also be deleted.')) {
      try {
        const section = await window.api.sections.getById(sectionId);
        const notebook = await window.api.notebooks.getById(section.notebook_id);
        await window.api.sections.delete(sectionId);
        await loadData();
        await handleNotebookSelect(notebook);

        if (selectedSection?.id === sectionId) {
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
        const id = await window.api.pages.create(selectedSection.id, title);
        const newPage = await window.api.pages.getById(id);
        await loadData();
        const section = await window.api.sections.getById(newPage.section_id);
          await handleSectionSelect(section, true);
        await handlePageSelect(newPage, true);
        setBlocks([]);
      } catch (error) {
        console.error('Error creating page:', error);
      }
    }
  };

  const handleDeletePage = async (pageId) => {
    if (window.confirm('Are you sure you want to delete this page?')) {
      try {
          const page = await window.api.pages.getById(pageId);
        const section = await window.api.sections.getById(page.section_id);
        await window.api.pages.delete(pageId);
        await loadData();
        await handleSectionSelect(section, true);
        if (selectedPage?.id === pageId) {
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
      await window.api.pages.update(pageId, newTitle);
      await loadData();
      setSelectedPage(prevPage =>
        prevPage && prevPage.id === pageId ? { ...prevPage, title: newTitle } : prevPage
      );
    } catch (error) {
      console.error('Error updating page title:', error);
    }
  };

  const handleToggleFavorite = async (pageId) => {
    try {
      await window.api.pages.toggleFavorite(pageId);
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
      const content = type === 'text' ? '# New Text Block\n\nStart typing...' : '// Write your code here';
      const language = type === 'code' ? 'javascript' : null;
      await window.api.blocks.create(selectedPage.id, type, content, language, null);
      const blocksData = await window.api.blocks.getByPage(selectedPage.id);
      setBlocks(blocksData);
    } catch (error) {
      console.error('Error creating block:', error);
    }
  };

  const handleUpdateBlock = async (blockId, content, language) => {
    try {
      await window.api.blocks.update(blockId, content, language);
      const blocksData = await window.api.blocks.getByPage(selectedPage.id);
      setBlocks(blocksData);
    } catch (error) {
      console.error('Error updating block:', error);
    }
  };

  const handleDeleteBlock = async (blockId) => {
    if (window.confirm('Are you sure you want to delete this block?')) {
      try {
        await window.api.blocks.delete(blockId);
        const blocksData = await window.api.blocks.getByPage(selectedPage.id);
        setBlocks(blocksData);
      } catch (error) {
        console.error('Error deleting block:', error);
      }
    }
  };

    const handleReorderBlock = async (blockId, newPosition) => {
    try {
      await window.api.blocks.reorder(blockId, newPosition);
      const blocksData = await window.api.blocks.getByPage(selectedPage.id);
      setBlocks(blocksData);
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
          selectedNotebook={selectedNotebook}
          selectedSection={selectedSection}
          onNotebookSelect={handleNotebookSelect}
          onSectionSelect={handleSectionSelect}
          onCreateNotebook={handleCreateNotebook}
          onCreateSection={handleCreateSection}
          onDeleteNotebook={handleDeleteNotebook}
          onDeleteSection={handleDeleteSection}
          onUpdateNotebook ={handleUpdateNotebook}
          onUpdateSection={handleUpdateSection}
          style={{ width: sidebarWidth }}
        />
        <div className="resizer" onMouseDown={startResizingSidebar}></div>
        <PagesList
          pages={pages.filter(p => selectedSection ? p.section_id === selectedSection.id : false)}
          selectedPage={selectedPage}
          onPageSelect={handlePageSelect}
          onCreatePage={handleCreatePage}
          onDeletePage={handleDeletePage}
          onToggleFavorite={handleToggleFavorite}
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
          style={{ flexGrow: 1 }}
        />
      </div>
    </DndProvider>
  );
}

export default App;