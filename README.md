# NetCodes - Code Snippet Manager

A powerful cross-platform desktop application for developers to store, organize, and manage code snippets and documentation. Built with Electron, React, SQLite, and Monaco Editor.

## Features

- **Organized Structure**: Organize your code snippets in Notebooks → Sections → Pages → Blocks
- **Multiple Block Types**:
  - Text blocks with Markdown rendering
  - Code blocks with syntax highlighting (powered by Monaco Editor)
  - Support for 20+ programming languages
- **Offline First**: All data stored locally in SQLite database
- **Favorites**: Mark important pages as favorites for quick access
- **Rich Code Editor**: Monaco Editor integration with syntax highlighting and code completion
- **Cross-Platform**: Works on Windows, macOS, and Linux

## Tech Stack

- **Electron** - Desktop application framework
- **React** - UI library
- **Vite** - Build tool and dev server
- **SQLite (better-sqlite3)** - Local database
- **Monaco Editor** - Code editor (same as VS Code)
- **Bootstrap 5** - UI styling
- **Marked** - Markdown rendering

## Project Structure

```
netcodes/
├── electron/
│   ├── main.js           # Electron main process
│   ├── preload.js        # Preload script for IPC
│   ├── database.js       # Database operations
│   └── schema.sql        # Database schema
├── src/
│   ├── components/       # React components
│   │   ├── Sidebar.jsx
│   │   ├── PagesList.jsx
│   │   ├── EditorPanel.jsx
│   │   ├── CodeBlock.jsx
│   │   └── TextBlock.jsx
│   ├── styles/
│   │   └── main.css
│   ├── App.jsx
│   └── index.jsx
├── index.html
├── vite.config.js
├── package.json
└── README.md
```

## Installation

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn

### Setup Steps

1. **Clone or navigate to the project directory**:
   ```bash
   cd NetCodes
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

   **Note**: On first install, the postinstall script will automatically rebuild `better-sqlite3` for Electron using `electron-builder install-app-deps`.

3. **Run the application in development mode**:
   ```bash
   npm run electron:dev
   ```

   This will:
   - Start the Vite dev server on http://localhost:5173
   - Launch the Electron application
   - Enable hot module replacement for quick development

### Troubleshooting Installation

If you encounter issues with `better-sqlite3` on Windows, you may need to install build tools:

```bash
npm install --global windows-build-tools
```

Or install Visual Studio Build Tools manually from:
https://visualstudio.microsoft.com/downloads/

Then rebuild the native module:
```bash
npx @electron/rebuild
```

## Usage

### First Launch

When you first launch NetCodes, you'll see sample data including:
- 2 notebooks (My First Notebook, JavaScript Projects)
- Several sections and pages
- Example code snippets and text blocks

### Creating Content

1. **Create a Notebook**:
   - Click the "Notebook" button in the sidebar
   - Enter a name for your notebook

2. **Create a Section**:
   - Select a notebook
   - Click the "Section" button
   - Enter a section title

3. **Create a Page**:
   - Select a section
   - Click the "+" button in the Pages panel
   - Enter a page title

4. **Add Blocks to a Page**:
   - Select a page
   - Click "Text" to add a text block with Markdown support
   - Click "Code" to add a code block with syntax highlighting

### Editing Content

- **Text Blocks**: Click the edit (pencil) icon, modify the content, then click the checkmark to save
- **Code Blocks**: Click the edit icon, modify the code, change language if needed, then save
- **Copy Code**: Click the clipboard icon on code blocks to copy to clipboard
- **Delete Blocks**: Click the trash icon to delete a block

### Managing Pages

- **Favorite a Page**: Click the star icon on any page
- **Delete a Page**: Click the trash icon on a page

## Database

The SQLite database is stored in your system's application data folder:
- **Windows**: `%APPDATA%\netcodes\netcodes.sqlite`
- **macOS**: `~/Library/Application Support/netcodes/netcodes.sqlite`
- **Linux**: `~/.config/netcodes/netcodes.sqlite`

### Database Schema

- **notebooks**: Store notebook information
- **sections**: Store sections within notebooks
- **pages**: Store individual pages within sections
- **blocks**: Store content blocks (text/code) within pages
- **tags**: Store tags for categorization
- **page_tags**: Junction table for many-to-many relationship

## Development

### Available Scripts

- `npm run dev` - Start Vite dev server only
- `npm run electron:dev` - Start both Vite and Electron in development mode
- `npm run build` - Build the React app for production
- `npm run electron:build` - Build Electron application for distribution

### Building for Production

To create distributable packages:

```bash
npm run build
npm run electron:build
```

This will create platform-specific installers in the `dist-electron` folder.

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

## Keyboard Shortcuts (in Monaco Editor)

- `Ctrl+S` / `Cmd+S` - Save (when editing)
- `Ctrl+F` / `Cmd+F` - Find
- `Ctrl+H` / `Cmd+H` - Find and Replace
- `Ctrl+D` / `Cmd+D` - Add selection to next find match
- `Alt+Up/Down` - Move line up/down
- `Shift+Alt+Up/Down` - Copy line up/down

## Future Enhancements

- [ ] Search functionality (SQLite FTS5)
- [ ] Dark mode toggle
- [ ] Drag-and-drop reordering
- [ ] Export/Import database
- [ ] Tag management UI
- [ ] Attachment support
- [ ] Code snippet templates
- [ ] Keyboard shortcuts
- [ ] Full-text search across all content

## Troubleshooting

### Database Issues
If you encounter database issues, delete the database file (see Database section for location) and restart the app. Sample data will be recreated.

### Development Server Not Starting
Make sure port 5173 is not in use by another application.

### Electron Not Opening
Check the console for errors. Make sure all dependencies are installed correctly with `npm install`.

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Author

Built with ❤️ for developers who love to organize their code snippets.
