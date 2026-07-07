# NetCodes — Code Snippet Manager

A cross-platform desktop application for developers to store, organize, and manage code snippets and documentation. Built with Electron, React, SQLite, and Monaco Editor.

## Features

### Organization
- **Hierarchical structure**: Notebooks → Sections → Pages → Blocks
- **Drag & drop** notebooks in the sidebar
- **Reorder** sections, pages and blocks (up/down buttons)
- **Move** a page to another section, or a section to another notebook (MoveModal)
- **Custom emoji icon** for each notebook

### Editing
- **Text blocks** with Markdown rendering (headings, bold, lists, inline code...)
- **Code blocks** with syntax highlighting via Monaco Editor (20+ languages)
- **Language saved** per code block
- **Favorites**: mark important pages for quick access

### Search
- **Search modal** (Ctrl+K / Cmd+K) with results grouped by notebooks, sections and pages
- **Full-text search** across page titles, block titles and block content
- **Auto-select**: clicking a result automatically expands and selects the notebook, section and page

### Export
- **Word export (.docx)** from a page, a section or an entire notebook
- Markdown converted to rich text (headings, bold, italic, lists)
- Code blocks rendered in monospace font with grey background

### Data
- **Local SQLite storage**, fully offline
- **Configurable database path** via app settings

## Tech Stack

- **Electron 40** — Desktop application framework
- **React** — UI library
- **Vite** — Build tool and dev server
- **SQLite (better-sqlite3)** — Local database
- **Monaco Editor** — Code editor (same as VS Code)
- **Bootstrap 5** — UI styling
- **Marked** — Markdown rendering
- **docx** — Word document generation
- **react-dnd** — Drag & drop

## Project Structure

```
netcodes/
├── electron/
│   ├── main.js           # Electron main process + IPC handlers
│   ├── preload.cjs       # Preload script (API bridge renderer ↔ main)
│   ├── database.js       # All SQLite operations
│   ├── export.js         # Word (.docx) generation
│   ├── settings.js       # Database path management
│   └── schema.sql        # Database schema
├── src/
│   ├── components/
│   │   ├── Sidebar.jsx         # Notebooks and sections
│   │   ├── PagesList.jsx       # Pages list for a section
│   │   ├── EditorPanel.jsx     # Block editor
│   │   ├── CodeBlock.jsx       # Code block (Monaco)
│   │   ├── TextBlock.jsx       # Text block (Markdown)
│   │   ├── SearchModal.jsx     # Search modal
│   │   ├── MoveModal.jsx       # Move modal
│   │   └── ExportModal.jsx     # Word export modal
│   ├── styles/
│   │   └── main.css
│   ├── App.jsx
│   └── index.jsx
├── tests/
│   ├── helpers/
│   │   └── db.js               # Helper: in-memory SQLite DB
│   └── database.test.js        # Unit tests (55 tests)
├── vite.config.js
├── package.json
└── README.md
```

## Installation

### Prerequisites

- Node.js v20 or higher
- npm

### Setup Steps

1. **Clone or navigate to the project directory**:
   ```bash
   cd NetCodes
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Run in development mode**:
   ```bash
   npm run electron:dev
   ```

## Usage

### Creating Content

| Action | How |
|---|---|
| New notebook | Click **Notebook** in the sidebar |
| New section | Click **Section** in the sidebar |
| New page | Click **+** in the Pages panel |
| Text block | Click **Text** in the editor toolbar |
| Code block | Click **Code** in the editor toolbar |

### Organizing

- **Reorder**: use ↑↓ buttons on sections, pages and blocks
- **Drag & drop**: drag notebooks in the sidebar
- **Move**: click the `→□` icon on a page (pick a section) or a section (pick a notebook)
- **Change icon**: click a notebook's emoji to open the icon picker

### Searching

- **Ctrl+K** (Windows/Linux) or **Cmd+K** (macOS) to open the search modal
- Results are grouped into **Notebooks**, **Sections** and **Pages**
- Clicking a result automatically selects and expands the full tree path

### Exporting to Word

- **Current page**: `📄W` button in the editor toolbar
- **Specific page**: `📄W` button on a page in the list
- **Section**: `📄W` button on a section in the sidebar
- **Notebook**: `📄W` button on a notebook in the sidebar

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| Ctrl+K / Cmd+K | Open search |
| Escape | Close active modal |
| Ctrl+S / Cmd+S | Save (in Monaco Editor) |
| Ctrl+F / Cmd+F | Find (in Monaco Editor) |
| Ctrl+H / Cmd+H | Find and Replace (in Monaco Editor) |
| Alt+↑/↓ | Move line up/down (in Monaco Editor) |
| Shift+Alt+↑/↓ | Copy line up/down (in Monaco Editor) |

## Database

The SQLite database is stored in your system's application data folder:

| OS | Path |
|---|---|
| Windows | `%APPDATA%\NetCodes\netcodes.sqlite` |
| macOS | `~/Library/Application Support/NetCodes/netcodes.sqlite` |
| Linux | `~/.config/NetCodes/netcodes.sqlite` |

The path can be changed via **Settings** in the application.

## Tests

```bash
npm test
```

55 unit tests covering:
- `notebookOps` — CRUD, reorder, cascade delete
- `sectionOps` — CRUD, reorder, move between notebooks
- `pageOps` — CRUD, reorder, move between sections, favorites
- `blockOps` — CRUD, reorder
- `searchOps` — search by notebook/section/page/block content/block title
- `export` — docx generation for page, section, notebook (including empty cases)

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server only |
| `npm run electron:dev` | Start Vite + Electron in development |
| `npm run build` | Build React app for production |
| `npm run electron:build` | Build Electron app for distribution |
| `npm run rebuild:electron` | Rebuild `better-sqlite3` for Electron (before packaging) |
| `npm run rebuild:node` | Rebuild `better-sqlite3` for Node.js (before running tests) |
| `npm test` | Run unit tests |
| `npm run test:watch` | Run tests in watch mode |

## Supported Languages

The code editor supports syntax highlighting for:
- JavaScript, TypeScript
- Python, Java, C#, C++, C
- Go, Rust, PHP, Ruby
- Swift, Kotlin
- HTML, CSS, SCSS
- JSON, YAML, XML
- SQL, Markdown, Shell
- Plain Text

## Troubleshooting

### Build fails on macOS (`better-sqlite3` prebuild not found)

This happens when the Electron version in use is not supported by the installed `better-sqlite3` version, or when a previous build left a `build/` directory owned by `root` inside `node_modules/better-sqlite3`.

**Symptoms**

```
prebuild-install warn install No prebuilt binaries found (target=X.X.X runtime=electron ...)
gyp ERR! stack Error: EACCES: permission denied, unlink 'build/config.gypi'
```

**Fix**

1. Fix permissions on the native build directory:
   ```bash
   sudo chown -R $(whoami) node_modules/better-sqlite3/build/
   ```

2. Reinstall and rebuild:
   ```bash
   npm install
   npm run electron:build
   ```

> `better-sqlite3@12` requires **Electron 29 or higher**. The project ships with Electron 40 which is fully compatible.

---

### `better-sqlite3` not found (Windows)

`better-sqlite3` is a native module that must be compiled for the exact Electron version. On Windows, this requires the **Visual Studio C++ Build Tools**.

**Step 1 — Install Build Tools**

Open PowerShell as Administrator and run:

```powershell
winget install Microsoft.VisualStudio.2022.BuildTools --override "--quiet --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

Or open **Visual Studio Installer** → **Modify** → check **Desktop development with C++** → **Modify**.

**Step 2 — Rebuild the native module**

After installation, restart your terminal and run:

```powershell
npx electron-rebuild -f -w better-sqlite3
```

**Step 3 — Run or build**

```powershell
npm run electron        # dev mode
npm run electron:build  # production build
```

> Note: `electron:build` automatically runs `rebuild:electron` before packaging. After a build, run `npm run rebuild:node` to restore `better-sqlite3` for Node.js if you need to run tests.

### Build fails with `Access is denied` (Windows)

A previous Electron process is locking build output files. Kill all Electron processes and delete the output folder before retrying:

```powershell
Get-Process -Name "electron","netcodes" -ErrorAction SilentlyContinue | Stop-Process -Force
Remove-Item dist-electron -Recurse -Force
npm run electron:build
```

### Database issues

If you encounter database corruption or unexpected errors, the app runs `REINDEX` automatically on startup to repair indexes. If issues persist, delete the database file (see Database section for the path) and restart — the app will create a fresh database.

### Development server not starting

Make sure port 5200 is not in use by another application.

### Electron not opening

Check the terminal for errors and make sure all dependencies are installed with `npm install`.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Use [Conventional Commits](https://www.conventionalcommits.org/)
3. Create your feature branch (`git checkout -b feature/my-feature`)
4. Commit your changes (`git commit -m 'Add my feature'`)
5. Push to the branch (`git push origin feature/my-feature`)
6. Open a Pull Request

## License

MIT

## Author

Parfait BENE — [parfaitbene.com](https://parfaitbene.com)

---

> This project was vibecoded with [Claude Code](https://claude.ai/code)
