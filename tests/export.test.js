import {
  describe, it, expect, vi, beforeEach, afterEach,
} from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { openTestConnection, closeAllTestConnections } from './helpers/conn.js';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'netcodes-export-'));

// electron/export.js n'utilise que `dialog` (showSaveDialog / showOpenDialog) :
// on le mocke pour rediriger les exports vers des chemins temporaires sans
// ouvrir de vraie boîte de dialogue native (mêmes conventions que
// tests/settings.test.js pour `electron`).
const mockDialog = {
  showSaveDialog: vi.fn(),
  showOpenDialog: vi.fn(),
};

vi.mock('electron', () => ({ dialog: mockDialog }));

const { exportOps } = await import('../electron/export.js');
const {
  notebookOps, sectionOps, pageOps, blockOps,
} = await import('../electron/database.js');

let connId;

beforeEach(async () => {
  connId = await openTestConnection();
  mockDialog.showSaveDialog.mockReset();
  mockDialog.showOpenDialog.mockReset();
});

afterEach(async () => {
  await closeAllTestConnections();
});

// Seed : Notebook > Section > Page avec un bloc texte et un bloc code, dont
// le contenu identifie sans ambiguïté chaque source dans les sorties
// générées (utile pour repérer un `[object Promise]` ou un `undefined`
// provenant d'un `await` manquant).
async function seed(cid) {
  const nb = await notebookOps.create(cid, 'Notebook Export', '📓');
  const sec = await sectionOps.create(cid, nb, 'Section Export', '#007bff');
  const page = await pageOps.create(cid, sec, 'Page Export Title');
  const textBlock = await blockOps.create(
    cid, page, 'text', 'Contenu texte du bloc TEXTMARK', null, null, 'Intro Bloc',
  );
  const codeBlock = await blockOps.create(
    cid, page, 'code', 'console.log("CODEMARK")', 'javascript', null, 'Snippet Bloc',
  );
  return {
    nb, sec, page, textBlock, codeBlock,
  };
}

function assertNoLeakedPromise(content) {
  expect(content).not.toContain('[object Promise]');
  expect(content).not.toContain('undefined');
}

describe('exportOps.exportPage', () => {
  it('génère un .md contenant le titre de page, le bloc texte et le bloc code', async () => {
    const ids = await seed(connId);
    const outFile = path.join(tmpDir, 'export-page.md');
    mockDialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: outFile });

    const result = await exportOps.exportPage(connId, ids.page, 'md', 'merged');

    expect(result.saved).toBe(true);
    expect(result.filePath).toBe(outFile);

    const content = fs.readFileSync(outFile, 'utf-8');
    expect(content).toContain('Page Export Title');
    expect(content).toContain('Contenu texte du bloc TEXTMARK');
    expect(content).toContain('console.log("CODEMARK")');
    assertNoLeakedPromise(content);
  });

  it('génère un .docx exploitable (buffer non vide) pour la même page', async () => {
    const ids = await seed(connId);
    const outFile = path.join(tmpDir, 'export-page.docx');
    mockDialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: outFile });

    const result = await exportOps.exportPage(connId, ids.page, 'docx', 'merged');

    expect(result.saved).toBe(true);
    const buffer = fs.readFileSync(outFile);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(500);
  });

  it('exportPage en mode "split" écrit un fichier .md par bloc dans le dossier choisi', async () => {
    const ids = await seed(connId);
    const destDir = path.join(tmpDir, 'split-dest');
    fs.mkdirSync(destDir, { recursive: true });
    mockDialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [destDir] });

    const result = await exportOps.exportPage(connId, ids.page, 'md', 'split');

    expect(result.saved).toBe(true);
    const files = fs.readdirSync(result.filePath);
    expect(files.length).toBe(2);

    const allContent = files
      .map((f) => fs.readFileSync(path.join(result.filePath, f), 'utf-8'))
      .join('\n');
    expect(allContent).toContain('Contenu texte du bloc TEXTMARK');
    expect(allContent).toContain('console.log("CODEMARK")');
    assertNoLeakedPromise(allContent);
  });

  it('retourne une erreur si la page est introuvable', async () => {
    const result = await exportOps.exportPage(connId, 999999, 'md', 'merged');
    expect(result.saved).toBe(false);
    expect(result.error).toBe('Page not found');
  });
});

describe('exportOps.exportBlock', () => {
  it('génère un .md contenant uniquement le contenu du bloc demandé', async () => {
    const ids = await seed(connId);
    const outFile = path.join(tmpDir, 'export-block.md');
    mockDialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: outFile });

    const result = await exportOps.exportBlock(connId, ids.textBlock, 'md');

    expect(result.saved).toBe(true);
    const content = fs.readFileSync(outFile, 'utf-8');
    expect(content).toContain('Contenu texte du bloc TEXTMARK');
    assertNoLeakedPromise(content);
  });
});

describe('exportOps.exportSection', () => {
  it('reproduit Section > Page.md sur disque', async () => {
    const ids = await seed(connId);
    const destDir = path.join(tmpDir, 'section-dest');
    fs.mkdirSync(destDir, { recursive: true });
    mockDialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [destDir] });

    const result = await exportOps.exportSection(connId, ids.sec, 'md', 'merged');

    expect(result.saved).toBe(true);
    expect(result.isDir).toBe(true);
    const pageFile = path.join(result.filePath, 'Page Export Title.md');
    expect(fs.existsSync(pageFile)).toBe(true);

    const content = fs.readFileSync(pageFile, 'utf-8');
    expect(content).toContain('Page Export Title');
    expect(content).toContain('Contenu texte du bloc TEXTMARK');
    assertNoLeakedPromise(content);
  });
});

describe('exportOps.exportNotebook', () => {
  it('reproduit Notebook > Section > Page.md sur disque', async () => {
    const ids = await seed(connId);
    const destDir = path.join(tmpDir, 'notebook-dest');
    fs.mkdirSync(destDir, { recursive: true });
    mockDialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [destDir] });

    const result = await exportOps.exportNotebook(connId, ids.nb, 'md', 'merged');

    expect(result.saved).toBe(true);
    expect(result.isDir).toBe(true);
    const pageFile = path.join(result.filePath, 'Section Export', 'Page Export Title.md');
    expect(fs.existsSync(pageFile)).toBe(true);

    const content = fs.readFileSync(pageFile, 'utf-8');
    expect(content).toContain('console.log("CODEMARK")');
    assertNoLeakedPromise(content);
  });
});
