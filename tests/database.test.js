import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openTestConnection, closeAllTestConnections } from './helpers/conn.js';
import {
  notebookOps, sectionOps, pageOps, blockOps, tagOps, searchOps,
} from '../electron/database.js';

let connId;

beforeEach(async () => {
  connId = await openTestConnection();
});

afterEach(async () => {
  await closeAllTestConnections();
});

// Reproduit le seed de l'ancien tests/helpers/db.js#seedDb, mais via les
// vrais ops (async, connId) au lieu d'insertions SQL directes.
async function seed(cid) {
  const nb1 = await notebookOps.create(cid, 'Notebook A', '📓');
  const nb2 = await notebookOps.create(cid, 'Notebook B', '📘');

  const sec1 = await sectionOps.create(cid, nb1, 'Section 1', '#007bff');
  const sec2 = await sectionOps.create(cid, nb1, 'Section 2', '#28a745');
  const sec3 = await sectionOps.create(cid, nb2, 'Section 3', '#dc3545');

  const p1 = await pageOps.create(cid, sec1, 'Page 1');
  const p2 = await pageOps.create(cid, sec1, 'Page 2');
  const p3 = await pageOps.create(cid, sec2, 'Page 3');

  const b1 = await blockOps.create(cid, p1, 'text', '# Hello\n\nWorld', null, null, 'Intro');
  const b2 = await blockOps.create(cid, p1, 'code', 'console.log("hi")', 'javascript', null, 'Snippet');
  const b3 = await blockOps.create(cid, p2, 'text', 'Plain text', null, null, null);

  return { nb1, nb2, sec1, sec2, sec3, p1, p2, p3, b1, b2, b3 };
}

// ─── Notebooks ──────────────────────────────────────────────────────────────

describe('notebookOps', () => {
  let ids;

  beforeEach(async () => {
    ids = await seed(connId);
  });

  it('getAll retourne tous les notebooks triés par position', async () => {
    const all = await notebookOps.getAll(connId);
    expect(all).toHaveLength(2);
    expect(all[0].name).toBe('Notebook A');
    expect(all[1].name).toBe('Notebook B');
  });

  it('getById retourne le bon notebook', async () => {
    const nb = await notebookOps.getById(connId, ids.nb1);
    expect(nb.name).toBe('Notebook A');
    expect(nb.icon).toBe('📓');
  });

  it('getById retourne undefined pour un id inexistant', async () => {
    expect(await notebookOps.getById(connId, 9999)).toBeUndefined();
  });

  it('create ajoute un notebook avec position auto-incrémentée', async () => {
    const id = await notebookOps.create(connId, 'Notebook C', '📗');
    const nb = await notebookOps.getById(connId, id);
    expect(nb.name).toBe('Notebook C');
    expect(nb.icon).toBe('📗');
    expect(nb.position).toBe(3);
  });

  it('create avec icône par défaut', async () => {
    const id = await notebookOps.create(connId, 'Sans icône');
    expect((await notebookOps.getById(connId, id)).icon).toBe('📓');
  });

  it('update modifie le nom et l\'icône', async () => {
    await notebookOps.update(connId, ids.nb1, 'Renamed', '📕');
    const nb = await notebookOps.getById(connId, ids.nb1);
    expect(nb.name).toBe('Renamed');
    expect(nb.icon).toBe('📕');
  });

  it('delete supprime le notebook et ses sections en cascade', async () => {
    await notebookOps.delete(connId, ids.nb1);
    expect(await notebookOps.getById(connId, ids.nb1)).toBeUndefined();
    expect(await sectionOps.getByNotebook(connId, ids.nb1)).toHaveLength(0);
  });

  it('reorder met à jour la position', async () => {
    await notebookOps.reorder(connId, ids.nb1, 5);
    expect((await notebookOps.getById(connId, ids.nb1)).position).toBe(5);
  });
});

// ─── Sections ───────────────────────────────────────────────────────────────

describe('sectionOps', () => {
  let ids;

  beforeEach(async () => {
    ids = await seed(connId);
  });

  it('getAll retourne toutes les sections', async () => {
    expect(await sectionOps.getAll(connId)).toHaveLength(3);
  });

  it('getByNotebook retourne les sections du bon notebook triées par position', async () => {
    const secs = await sectionOps.getByNotebook(connId, ids.nb1);
    expect(secs).toHaveLength(2);
    expect(secs[0].title).toBe('Section 1');
    expect(secs[1].title).toBe('Section 2');
  });

  it('getByNotebook retourne [] pour un notebook sans sections', async () => {
    const newNb = await notebookOps.create(connId, 'Empty NB');
    expect(await sectionOps.getByNotebook(connId, newNb)).toHaveLength(0);
  });

  it('getById retourne la bonne section', async () => {
    const sec = await sectionOps.getById(connId, ids.sec1);
    expect(sec.title).toBe('Section 1');
    expect(sec.notebook_id).toBe(ids.nb1);
  });

  it('create ajoute avec position auto-incrémentée dans le notebook', async () => {
    const id = await sectionOps.create(connId, ids.nb1, 'Section 4', '#ff0000');
    const sec = await sectionOps.getById(connId, id);
    expect(sec.title).toBe('Section 4');
    expect(sec.position).toBe(3);
    expect(sec.notebook_id).toBe(ids.nb1);
  });

  it('create première section dans un nouveau notebook a position 1', async () => {
    const nbId = await notebookOps.create(connId, 'New NB');
    const id = await sectionOps.create(connId, nbId, 'First');
    expect((await sectionOps.getById(connId, id)).position).toBe(1);
  });

  it('update modifie le titre et la couleur', async () => {
    await sectionOps.update(connId, ids.sec1, 'Updated', '#ffffff');
    const sec = await sectionOps.getById(connId, ids.sec1);
    expect(sec.title).toBe('Updated');
    expect(sec.color).toBe('#ffffff');
  });

  it('delete supprime la section et ses pages en cascade', async () => {
    await sectionOps.delete(connId, ids.sec1);
    expect(await sectionOps.getById(connId, ids.sec1)).toBeUndefined();
    expect(await pageOps.getBySection(connId, ids.sec1)).toHaveLength(0);
  });

  it('reorder met à jour la position', async () => {
    await sectionOps.reorder(connId, ids.sec1, 10);
    expect((await sectionOps.getById(connId, ids.sec1)).position).toBe(10);
  });

  it('move déplace une section vers un autre notebook avec nouvelle position', async () => {
    await sectionOps.move(connId, ids.sec1, ids.nb2);
    const sec = await sectionOps.getById(connId, ids.sec1);
    expect(sec.notebook_id).toBe(ids.nb2);
    expect(sec.position).toBe(2); // sec3 est déjà en position 1 dans nb2
  });

  it('move vers un notebook vide attribue position 1', async () => {
    const nbId = await notebookOps.create(connId, 'Empty NB');
    await sectionOps.move(connId, ids.sec1, nbId);
    expect((await sectionOps.getById(connId, ids.sec1)).position).toBe(1);
  });
});

// ─── Pages ──────────────────────────────────────────────────────────────────

describe('pageOps', () => {
  let ids;

  beforeEach(async () => {
    ids = await seed(connId);
  });

  it('getAll retourne toutes les pages', async () => {
    expect(await pageOps.getAll(connId)).toHaveLength(3);
  });

  it('getBySection retourne les pages de la section triées par position', async () => {
    const pages = await pageOps.getBySection(connId, ids.sec1);
    expect(pages).toHaveLength(2);
    expect(pages[0].title).toBe('Page 1');
    expect(pages[1].title).toBe('Page 2');
  });

  it('getBySection retourne [] pour section vide', async () => {
    expect(await pageOps.getBySection(connId, ids.sec3)).toHaveLength(0);
  });

  it('getById retourne la bonne page', async () => {
    const page = await pageOps.getById(connId, ids.p1);
    expect(page.title).toBe('Page 1');
    expect(page.section_id).toBe(ids.sec1);
  });

  it('create ajoute une page avec position auto-incrémentée', async () => {
    const id = await pageOps.create(connId, ids.sec1, 'Page New');
    const page = await pageOps.getById(connId, id);
    expect(page.title).toBe('Page New');
    expect(page.position).toBe(3);
  });

  it('create première page d\'une section a position 1', async () => {
    const id = await pageOps.create(connId, ids.sec3, 'First Page');
    expect((await pageOps.getById(connId, id)).position).toBe(1);
  });

  it('update modifie le titre', async () => {
    await pageOps.update(connId, ids.p1, 'Renamed Page');
    expect((await pageOps.getById(connId, ids.p1)).title).toBe('Renamed Page');
  });

  it('toggleFavorite active le favori', async () => {
    await pageOps.toggleFavorite(connId, ids.p1);
    expect((await pageOps.getById(connId, ids.p1)).favorite).toBe(1);
  });

  it('toggleFavorite désactive le favori si déjà actif', async () => {
    await pageOps.toggleFavorite(connId, ids.p1);
    await pageOps.toggleFavorite(connId, ids.p1);
    expect((await pageOps.getById(connId, ids.p1)).favorite).toBe(0);
  });

  it('getFavorites retourne seulement les pages favorites', async () => {
    await pageOps.toggleFavorite(connId, ids.p1);
    await pageOps.toggleFavorite(connId, ids.p2);
    const favs = await pageOps.getFavorites(connId);
    expect(favs).toHaveLength(2);
    expect(favs.every(p => p.favorite === 1)).toBe(true);
  });

  it('delete supprime la page et ses blocs en cascade', async () => {
    await pageOps.delete(connId, ids.p1);
    expect(await pageOps.getById(connId, ids.p1)).toBeUndefined();
    expect(await blockOps.getByPage(connId, ids.p1)).toHaveLength(0);
  });

  it('reorder met à jour la position', async () => {
    await pageOps.reorder(connId, ids.p1, 99);
    expect((await pageOps.getById(connId, ids.p1)).position).toBe(99);
  });

  it('move déplace une page vers une autre section', async () => {
    await pageOps.move(connId, ids.p1, ids.sec2);
    const page = await pageOps.getById(connId, ids.p1);
    expect(page.section_id).toBe(ids.sec2);
    expect(page.position).toBe(2); // sec2 a déjà page p3 en position 1
  });

  it('move vers une section vide attribue position 1', async () => {
    await pageOps.move(connId, ids.p1, ids.sec3);
    expect((await pageOps.getById(connId, ids.p1)).position).toBe(1);
  });
});

// ─── Blocks ─────────────────────────────────────────────────────────────────

describe('blockOps', () => {
  let ids;

  beforeEach(async () => {
    ids = await seed(connId);
  });

  it('getByPage retourne les blocs triés par position', async () => {
    const blocks = await blockOps.getByPage(connId, ids.p1);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].type).toBe('text');
    expect(blocks[1].type).toBe('code');
  });

  it('getByPage retourne [] pour une page sans blocs', async () => {
    expect(await blockOps.getByPage(connId, ids.p3)).toHaveLength(0);
  });

  it('getById retourne le bon bloc', async () => {
    const block = await blockOps.getById(connId, ids.b1);
    expect(block.type).toBe('text');
    expect(block.title).toBe('Intro');
    expect(block.page_id).toBe(ids.p1);
  });

  it('create ajoute un bloc texte avec position auto-incrémentée', async () => {
    const id = await blockOps.create(connId, ids.p1, 'text', 'New content');
    const block = await blockOps.getById(connId, id);
    expect(block.type).toBe('text');
    expect(block.content).toBe('New content');
    expect(block.position).toBe(3);
  });

  it('create ajoute un bloc code avec language', async () => {
    const id = await blockOps.create(connId, ids.p3, 'code', 'print("hello")', 'python', null, 'My Script');
    const block = await blockOps.getById(connId, id);
    expect(block.language).toBe('python');
    expect(block.title).toBe('My Script');
    expect(block.position).toBe(1);
  });

  it('create premier bloc d\'une page a position 1', async () => {
    const id = await blockOps.create(connId, ids.p3, 'text', 'First');
    expect((await blockOps.getById(connId, id)).position).toBe(1);
  });

  it('update modifie le contenu, language et titre', async () => {
    await blockOps.update(connId, ids.b2, 'updated code', 'typescript', 'New Title');
    const block = await blockOps.getById(connId, ids.b2);
    expect(block.content).toBe('updated code');
    expect(block.language).toBe('typescript');
    expect(block.title).toBe('New Title');
  });

  it('delete supprime le bloc', async () => {
    await blockOps.delete(connId, ids.b1);
    expect(await blockOps.getById(connId, ids.b1)).toBeUndefined();
    expect(await blockOps.getByPage(connId, ids.p1)).toHaveLength(1);
  });

  it('reorder met à jour la position', async () => {
    await blockOps.reorder(connId, ids.b1, 5);
    expect((await blockOps.getById(connId, ids.b1)).position).toBe(5);
  });
});

// ─── Tags ───────────────────────────────────────────────────────────────────
// Aucune couverture n'existait en 1.x (tagOps n'était pas testé) ; on couvre
// le contrat de base au passage à la version async/connId.

describe('tagOps', () => {
  let ids;

  beforeEach(async () => {
    ids = await seed(connId);
  });

  it('getAll retourne tous les tags triés par nom', async () => {
    await tagOps.create(connId, 'zeta');
    await tagOps.create(connId, 'alpha');
    const all = await tagOps.getAll(connId);
    expect(all.map(t => t.name)).toEqual(['alpha', 'zeta']);
  });

  it('create ajoute un tag avec couleur par défaut', async () => {
    const id = await tagOps.create(connId, 'sans-couleur');
    const all = await tagOps.getAll(connId);
    expect(all.find(t => t.id === id).color).toBe('#6c757d');
  });

  it('create accepte une couleur explicite', async () => {
    const id = await tagOps.create(connId, 'rouge', '#ff0000');
    const all = await tagOps.getAll(connId);
    expect(all.find(t => t.id === id).color).toBe('#ff0000');
  });

  it('addToPage puis getByPage retourne le tag associé', async () => {
    const tagId = await tagOps.create(connId, 'important');
    await tagOps.addToPage(connId, ids.p1, tagId);
    const tags = await tagOps.getByPage(connId, ids.p1);
    expect(tags).toHaveLength(1);
    expect(tags[0].name).toBe('important');
  });

  it('getByPage retourne [] pour une page sans tag', async () => {
    expect(await tagOps.getByPage(connId, ids.p2)).toHaveLength(0);
  });

  it('removeFromPage retire l\'association sans supprimer le tag', async () => {
    const tagId = await tagOps.create(connId, 'important');
    await tagOps.addToPage(connId, ids.p1, tagId);
    await tagOps.removeFromPage(connId, ids.p1, tagId);
    expect(await tagOps.getByPage(connId, ids.p1)).toHaveLength(0);
    expect(await tagOps.getAll(connId)).toHaveLength(1);
  });
});

// ─── Search ─────────────────────────────────────────────────────────────────

describe('searchOps', () => {
  let ids;

  beforeEach(async () => {
    ids = await seed(connId);
  });

  it('recherche un notebook par nom', async () => {
    const results = await searchOps.search(connId, 'Notebook A');
    expect(results.notebooks).toHaveLength(1);
    expect(results.notebooks[0].notebook_name).toBe('Notebook A');
  });

  it('recherche une section par titre', async () => {
    const results = await searchOps.search(connId, 'Section 1');
    expect(results.sections).toHaveLength(1);
    expect(results.sections[0].section_title).toBe('Section 1');
  });

  it('recherche une page par titre', async () => {
    const results = await searchOps.search(connId, 'Page 1');
    expect(results.pages.length).toBeGreaterThanOrEqual(1);
    expect(results.pages.some(p => p.page_title === 'Page 1')).toBe(true);
  });

  it('recherche dans le contenu d\'un bloc', async () => {
    const results = await searchOps.search(connId, 'Hello');
    expect(results.pages.some(p => p.page_id === ids.p1)).toBe(true);
  });

  it('recherche dans le titre d\'un bloc', async () => {
    const results = await searchOps.search(connId, 'Snippet');
    expect(results.pages.some(p => p.page_id === ids.p1)).toBe(true);
  });

  it('retourne les 3 catégories vides pour une requête sans résultat', async () => {
    const results = await searchOps.search(connId, 'xyznotfound999');
    expect(results.notebooks).toHaveLength(0);
    expect(results.sections).toHaveLength(0);
    expect(results.pages).toHaveLength(0);
  });

  it('recherche partielle fonctionne', async () => {
    const results = await searchOps.search(connId, 'Note');
    expect(results.notebooks.length).toBeGreaterThanOrEqual(1);
  });

  it('retourne toutes les correspondances multi-catégories', async () => {
    // "Section" apparaît dans les titres de section
    const results = await searchOps.search(connId, 'Section');
    expect(results.sections.length).toBeGreaterThanOrEqual(3);
  });
});

// ─── Portabilité SQL ────────────────────────────────────────────────────────

describe('portabilité SQL', () => {
  it('toggleFavorite bascule 0→1→0 sans NOT booléen', async () => {
    const nb = await notebookOps.create(connId, 'N', '📓');
    const sec = await sectionOps.create(connId, nb, 'S');
    const p = await pageOps.create(connId, sec, 'P');
    await pageOps.toggleFavorite(connId, p);
    expect((await pageOps.getById(connId, p)).favorite).toBe(1);
    await pageOps.toggleFavorite(connId, p);
    expect((await pageOps.getById(connId, p)).favorite).toBe(0);
  });

  it('la recherche est insensible à la casse via LOWER()', async () => {
    const nb = await notebookOps.create(connId, 'Docker Notes', '📓');
    const r = await searchOps.search(connId, 'dOcKeR');
    expect(r.notebooks.length).toBe(1);
  });

  it('addToPage est idempotent sans INSERT OR IGNORE', async () => {
    const nb = await notebookOps.create(connId, 'N', '📓');
    const sec = await sectionOps.create(connId, nb, 'S');
    const p = await pageOps.create(connId, sec, 'P');
    const t = await tagOps.create(connId, 'tag1');
    await tagOps.addToPage(connId, p, t);
    await tagOps.addToPage(connId, p, t);
    expect((await tagOps.getByPage(connId, p)).length).toBe(1);
  });
});

// ─── Export (génération docx) ────────────────────────────────────────────────
// Ne teste pas database.js directement : vérifie que les données lues via les
// vrais ops (au lieu d'un accès SQL direct au fichier de test) suffisent à
// produire un buffer docx exploitable.

describe('export - génération docx', () => {
  let ids;

  beforeEach(async () => {
    ids = await seed(connId);
  });

  it('génère un buffer docx non vide pour une page', async () => {
    const { Document, Packer, Paragraph, TextRun, HeadingLevel, ShadingType } = await import('docx');
    const { marked } = await import('marked');

    function codeLineParagraph(line) {
      return new Paragraph({
        children: [new TextRun({ text: line || ' ', font: 'Courier New', size: 18 })],
        shading: { type: ShadingType.SOLID, color: 'F3F4F6', fill: 'F3F4F6' },
        spacing: { before: 0, after: 0 },
      });
    }

    function blockToParagraphs(block) {
      const parts = [];
      if (block.title) parts.push(new Paragraph({ children: [new TextRun({ text: block.title, bold: true })] }));
      if (block.type === 'code') {
        for (const line of (block.content || '').split('\n')) parts.push(codeLineParagraph(line));
      } else {
        const tokens = marked.lexer(block.content || '');
        for (const t of tokens) {
          if (t.type === 'paragraph' || t.type === 'heading') {
            parts.push(new Paragraph({ text: t.text || '' }));
          }
        }
      }
      return parts;
    }

    const page = await pageOps.getById(connId, ids.p1);
    const blocks = await blockOps.getByPage(connId, ids.p1);

    const children = [
      new Paragraph({ text: page.title, heading: HeadingLevel.HEADING_1 }),
      ...blocks.flatMap(b => blockToParagraphs(b)),
    ];

    const doc = new Document({ sections: [{ children }] });
    const buffer = await Packer.toBuffer(doc);

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(1000);
  });

  it('génère un buffer docx non vide pour une section avec plusieurs pages', async () => {
    const { Document, Packer, Paragraph, HeadingLevel } = await import('docx');

    const section = await sectionOps.getById(connId, ids.sec1);
    const pages = await pageOps.getBySection(connId, ids.sec1);

    const children = [
      new Paragraph({ text: section.title, heading: HeadingLevel.HEADING_1 }),
      ...pages.flatMap(p => [
        new Paragraph({ text: p.title, heading: HeadingLevel.HEADING_2 }),
      ]),
    ];

    const doc = new Document({ sections: [{ children }] });
    const buffer = await Packer.toBuffer(doc);

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(1000);
  });

  it('génère un buffer docx non vide pour un notebook complet', async () => {
    const { Document, Packer, Paragraph, HeadingLevel } = await import('docx');

    const notebook = await notebookOps.getById(connId, ids.nb1);
    const sections = await sectionOps.getByNotebook(connId, ids.nb1);

    const children = [
      new Paragraph({ text: notebook.name, heading: HeadingLevel.TITLE }),
    ];
    for (const sec of sections) {
      children.push(new Paragraph({ text: sec.title, heading: HeadingLevel.HEADING_1 }));
      const pages = await pageOps.getBySection(connId, sec.id);
      for (const page of pages) {
        children.push(new Paragraph({ text: page.title, heading: HeadingLevel.HEADING_2 }));
      }
    }

    const doc = new Document({ sections: [{ children }] });
    const buffer = await Packer.toBuffer(doc);

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(1000);
  });

  it('génère un docx valide pour une page sans blocs', async () => {
    const { Document, Packer, Paragraph, HeadingLevel } = await import('docx');
    const page = await pageOps.getById(connId, ids.p3);
    const doc = new Document({ sections: [{ children: [new Paragraph({ text: page.title, heading: HeadingLevel.HEADING_1 })] }] });
    const buffer = await Packer.toBuffer(doc);
    expect(buffer.length).toBeGreaterThan(500);
  });

  it('génère un docx valide pour un notebook sans sections', async () => {
    const { Document, Packer, Paragraph, HeadingLevel } = await import('docx');
    const nbId = await notebookOps.create(connId, 'Empty NB', '📓');
    const notebook = await notebookOps.getById(connId, nbId);
    const doc = new Document({ sections: [{ children: [new Paragraph({ text: notebook.name, heading: HeadingLevel.TITLE })] }] });
    const buffer = await Packer.toBuffer(doc);
    expect(buffer.length).toBeGreaterThan(500);
  });
});
