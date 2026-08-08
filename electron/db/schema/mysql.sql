-- Texte libre en TEXT (parité sqlite/postgres). VARCHAR conservé uniquement si requis : tags.name (UNIQUE impossible sur TEXT), colonnes à DEFAULT (icon, color), jetons courts app-contrôlés (type, language).

CREATE TABLE IF NOT EXISTS notebooks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name TEXT NOT NULL,
    icon VARCHAR(16) DEFAULT '📓',
    position INT NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sections (
    id INT AUTO_INCREMENT PRIMARY KEY,
    notebook_id INT NOT NULL,
    title TEXT NOT NULL,
    color VARCHAR(16) DEFAULT '#007bff',
    position INT NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_sections_notebook (notebook_id),
    CONSTRAINT fk_sections_notebook FOREIGN KEY (notebook_id) REFERENCES notebooks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    section_id INT NOT NULL,
    title TEXT NOT NULL,
    position INT NOT NULL DEFAULT 0,
    favorite INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_pages_section (section_id),
    CONSTRAINT fk_pages_section FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS blocks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    page_id INT NOT NULL,
    type VARCHAR(16) NOT NULL CHECK (type IN ('text', 'code', 'attachment')),
    title TEXT,
    content LONGTEXT,
    language VARCHAR(32),
    filename TEXT,
    filepath TEXT,
    position INT NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_blocks_page (page_id),
    CONSTRAINT fk_blocks_page FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tags (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(191) NOT NULL UNIQUE,
    color VARCHAR(16) DEFAULT '#6c757d'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS page_tags (
    page_id INT NOT NULL,
    tag_id INT NOT NULL,
    PRIMARY KEY (page_id, tag_id),
    INDEX idx_page_tags_page (page_id),
    INDEX idx_page_tags_tag (tag_id),
    CONSTRAINT fk_page_tags_page FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE,
    CONSTRAINT fk_page_tags_tag FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
