-- Notebooks table
CREATE TABLE IF NOT EXISTS notebooks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    icon TEXT DEFAULT '📓',
    position INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Sections table
CREATE TABLE IF NOT EXISTS sections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    notebook_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    color TEXT DEFAULT '#007bff',
    position INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (notebook_id) REFERENCES notebooks(id) ON DELETE CASCADE
);

-- Pages table
CREATE TABLE IF NOT EXISTS pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    section_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    favorite INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE
);

-- Blocks table
CREATE TABLE IF NOT EXISTS blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    page_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('text', 'code', 'attachment')),
    title TEXT,
    content TEXT,
    language TEXT,
    filename TEXT,
    filepath TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE
);

-- Tags table
CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color TEXT DEFAULT '#6c757d'
);

-- Page tags junction table
CREATE TABLE IF NOT EXISTS page_tags (
    page_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (page_id, tag_id),
    FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_sections_notebook ON sections(notebook_id);
CREATE INDEX IF NOT EXISTS idx_pages_section ON pages(section_id);
CREATE INDEX IF NOT EXISTS idx_blocks_page ON blocks(page_id);
CREATE INDEX IF NOT EXISTS idx_page_tags_page ON page_tags(page_id);
CREATE INDEX IF NOT EXISTS idx_page_tags_tag ON page_tags(tag_id);

-- Insert sample data only if database is empty
INSERT OR IGNORE INTO notebooks (id, name, icon, position) VALUES
    (1, 'My First Notebook', '📘', 0),
    (2, 'JavaScript Projects', '⚡', 1);

INSERT OR IGNORE INTO sections (id, notebook_id, title, color, position) VALUES
    (1, 1, 'Getting Started', '#28a745', 0),
    (2, 1, 'Advanced Topics', '#dc3545', 1),
    (3, 2, 'React Components', '#007bff', 0);

INSERT OR IGNORE INTO pages (id, section_id, title, position, favorite) VALUES
    (1, 1, 'Welcome to NetCodes', 0, 1),
    (2, 1, 'Quick Start Guide', 1, 0),
    (3, 2, 'Design Patterns', 0, 0),
    (4, 3, 'Custom Hooks', 0, 1);

INSERT OR IGNORE INTO blocks (id, page_id, type, content, language, position) VALUES
    (1, 1, 'text', '### Welcome to NetCodes\n\nThis is your code snippet manager. You can organize your code, notes, and documentation in notebooks, sections, and pages.', NULL, 0),
    (2, 1, 'code', 'console.log("Hello, NetCodes!");', 'javascript', 1),
    (3, 2, 'text', '#### Quick Start\n\n1. Create notebooks to organize your projects\n2. Add sections within notebooks\n3. Create pages with code snippets and notes', NULL, 0),
    (4, 3, 'text', '### Design Patterns in JavaScript', NULL, 0),
    (5, 3, 'code', 'class Singleton {\n  constructor() {\n    if (Singleton.instance) {\n      return Singleton.instance;\n    }\n    Singleton.instance = this;\n  }\n}\n\nexport default Singleton;', 'javascript', 1),
    (6, 4, 'text', '### Custom React Hooks', NULL, 0),
    (7, 4, 'code', 'import { useState, useEffect } from "react";\n\nexport function useLocalStorage(key, initialValue) {\n  const [value, setValue] = useState(() => {\n    const item = window.localStorage.getItem(key);\n    return item ? JSON.parse(item) : initialValue;\n  });\n\n  useEffect(() => {\n    window.localStorage.setItem(key, JSON.stringify(value));\n  }, [key, value]);\n\n  return [value, setValue];\n}', 'javascript', 1);

INSERT OR IGNORE INTO tags (id, name, color) VALUES
    (1, 'javascript', '#f7df1e'),
    (2, 'react', '#61dafb'),
    (3, 'tutorial', '#28a745');

INSERT OR IGNORE INTO page_tags (page_id, tag_id) VALUES
    (1, 3),
    (4, 1),
    (4, 2);
