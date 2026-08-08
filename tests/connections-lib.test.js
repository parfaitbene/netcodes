import { describe, it, expect } from 'vitest';
import {
  tagWithConnId,
  buildEntityKey,
  parseEntityKey,
  isCompositeEntityKey,
  findByConnAndId,
  matchesConnAndId,
  notebooksInConnection,
  sectionsInConnection,
  sectionsOfNotebook,
  pagesOfSection,
  replaceConnectionSlice,
  firstConnectedConnectionId,
  pruneToKnownConnections,
  resolveExpandedNotebookKeys,
  resolveLastActiveSelection,
} from '../src/lib/connections.js';

// Deux connIds réalistes (8 caractères hex, comme générés par
// crypto.randomBytes(4).toString('hex') dans electron/settings.js).
const CONN_A = 'a1b2c3d4';
const CONN_B = 'e5f6a7b8';

// Fixture centrale du fichier : deux connexions dont les notebooks,
// sections et pages partagent EXACTEMENT les mêmes ids numériques (1 et 2).
// C'est la collision que toute la logique de scoping doit résoudre.
function makeCollisionFixtures() {
  const notebooks = [
    { connId: CONN_A, id: 1, name: 'Notebook A1', position: 1 },
    { connId: CONN_B, id: 1, name: 'Notebook B1', position: 1 },
  ];
  const sections = [
    { connId: CONN_A, id: 1, notebook_id: 1, title: 'Section A1', position: 1 },
    { connId: CONN_B, id: 1, notebook_id: 1, title: 'Section B1', position: 1 },
  ];
  const pages = [
    { connId: CONN_A, id: 1, section_id: 1, title: 'Page A1', position: 1 },
    { connId: CONN_B, id: 1, section_id: 1, title: 'Page B1', position: 1 },
  ];
  return { notebooks, sections, pages };
}

describe('tagWithConnId', () => {
  it("attache connId à chaque ligne et ne mute ni le tableau ni les lignes d'origine", () => {
    const rows = [{ id: 1, name: 'a' }, { id: 2, name: 'b' }];
    const frozenRows = rows.map(Object.freeze);

    const tagged = tagWithConnId(frozenRows, CONN_A);

    expect(tagged).toEqual([
      { id: 1, name: 'a', connId: CONN_A },
      { id: 2, name: 'b', connId: CONN_A },
    ]);
    // Les objets d'origine (gelés) n'ont pas été touchés — sinon Object.freeze
    // aurait fait échouer l'appel en mode strict.
    expect(frozenRows[0].connId).toBeUndefined();
    expect(tagged).not.toBe(frozenRows);
    expect(tagged[0]).not.toBe(frozenRows[0]);
  });

  it('sur un tableau vide, retourne un tableau vide', () => {
    expect(tagWithConnId([], CONN_A)).toEqual([]);
  });
});

describe('clés composites : buildEntityKey / parseEntityKey / isCompositeEntityKey', () => {
  it('round-trip : build puis parse redonne { connId, id }', () => {
    const key = buildEntityKey(CONN_A, 42);
    expect(key).toBe('a1b2c3d4:42');
    expect(parseEntityKey(key)).toEqual({ connId: CONN_A, id: 42 });
  });

  it('documente l\'hypothèse : un connId est toujours 8 caractères hex et ne contient jamais ":"', () => {
    // generateId() dans electron/settings.js : crypto.randomBytes(4).toString('hex')
    expect(CONN_A).toMatch(/^[0-9a-f]{8}$/);
    expect(CONN_A).not.toContain(':');
    // Les ids de lignes (rowid SQLite) sont toujours des entiers, jamais de
    // deux-points non plus. Sous cette hypothèse, découper une clé composite
    // sur le PREMIER ':' rencontré est sans ambiguïté.
    expect(String(42)).not.toContain(':');
  });

  it('parseEntityKey renvoie null sur une clé mal formée', () => {
    expect(parseEntityKey('sans-deux-points')).toBeNull();
    expect(parseEntityKey('a1b2c3d4:')).toBeNull(); // id manquant
    expect(parseEntityKey(':42')).toBeNull(); // connId manquant
    expect(parseEntityKey('a1b2c3d4:12abc')).toBeNull(); // id non numérique
    expect(parseEntityKey(42)).toBeNull(); // pas une chaîne
    expect(parseEntityKey(null)).toBeNull();
  });

  it("isCompositeEntityKey distingue une clé multi-connexion d'un id brut pré-2.0", () => {
    expect(isCompositeEntityKey('a1b2c3d4:1')).toBe(true);
    expect(isCompositeEntityKey('1')).toBe(false); // format pré-2.0
    expect(isCompositeEntityKey(1)).toBe(false); // pas une chaîne
    expect(isCompositeEntityKey('a1b2c3d4')).toBe(false); // pas de ':'
    expect(isCompositeEntityKey('a1b2c3d4:1x')).toBe(false); // id non numérique
  });
});

describe("le cas de collision : deux connexions, mêmes ids numériques", () => {
  it('findByConnAndId ne renvoie que la ligne de la bonne connexion', () => {
    const { notebooks } = makeCollisionFixtures();
    expect(findByConnAndId(notebooks, CONN_A, 1)).toBe(notebooks[0]);
    expect(findByConnAndId(notebooks, CONN_B, 1)).toBe(notebooks[1]);
    expect(findByConnAndId(notebooks, 'ffffffff', 1)).toBeNull();
  });

  it("matchesConnAndId ne matche pas un id identique venant d'une AUTRE connexion", () => {
    const { notebooks } = makeCollisionFixtures();
    expect(matchesConnAndId(notebooks[0], CONN_A, 1)).toBe(true);
    expect(matchesConnAndId(notebooks[0], CONN_B, 1)).toBe(false);
    expect(matchesConnAndId(null, CONN_A, 1)).toBe(false);
    expect(matchesConnAndId(undefined, CONN_A, 1)).toBe(false);
  });

  it('notebooksInConnection / sectionsInConnection isolent chaque connexion', () => {
    const { notebooks, sections } = makeCollisionFixtures();
    expect(notebooksInConnection(notebooks, CONN_A)).toEqual([notebooks[0]]);
    expect(notebooksInConnection(notebooks, CONN_B)).toEqual([notebooks[1]]);
    expect(sectionsInConnection(sections, CONN_A)).toEqual([sections[0]]);
    expect(sectionsInConnection(sections, CONN_B)).toEqual([sections[1]]);
  });

  it('sectionsOfNotebook : le notebook_id=1 de chaque connexion a ses PROPRES sections', () => {
    const { sections } = makeCollisionFixtures();
    expect(sectionsOfNotebook(sections, CONN_A, 1)).toEqual([sections[0]]);
    expect(sectionsOfNotebook(sections, CONN_B, 1)).toEqual([sections[1]]);
    // Une connexion sans section pour ce notebook_id : tableau vide, pas une
    // fuite des sections de l'autre connexion.
    expect(sectionsOfNotebook(sections, 'ffffffff', 1)).toEqual([]);
  });

  it('pagesOfSection : le section_id=1 de chaque connexion a ses PROPRES pages', () => {
    const { pages } = makeCollisionFixtures();
    expect(pagesOfSection(pages, CONN_A, 1)).toEqual([pages[0]]);
    expect(pagesOfSection(pages, CONN_B, 1)).toEqual([pages[1]]);
  });

  it('replaceConnectionSlice ne remplace que la tranche de la connexion ciblée', () => {
    const { notebooks } = makeCollisionFixtures();
    const freshA = [{ connId: CONN_A, id: 99, name: 'Notebook A99' }];
    const result = replaceConnectionSlice(notebooks, CONN_A, freshA);
    // La ligne de CONN_B (id=1, potentiellement en collision) doit survivre
    // intacte ; celle de CONN_A doit avoir été remplacée.
    expect(result).toEqual([notebooks[1], freshA[0]]);
  });
});

describe('firstConnectedConnectionId', () => {
  it('renvoie l\'id de la première connexion à l\'état "connected"', () => {
    const connections = [
      { id: 'c1', status: { state: 'closed' } },
      { id: 'c2', status: { state: 'connected' } },
      { id: 'c3', status: { state: 'connected' } },
    ];
    expect(firstConnectedConnectionId(connections)).toBe('c2');
  });

  it('renvoie undefined si aucune connexion n\'est connectée', () => {
    expect(firstConnectedConnectionId([{ id: 'c1', status: { state: 'error' } }])).toBeUndefined();
    expect(firstConnectedConnectionId([])).toBeUndefined();
  });
});

describe('pruneToKnownConnections', () => {
  it('ne garde que les ids présents dans la liste de connexions courante', () => {
    const connections = [{ id: 'c1' }, { id: 'c2' }];
    expect(pruneToKnownConnections(['c1', 'c2', 'deleted'], connections)).toEqual(['c1', 'c2']);
    expect(pruneToKnownConnections([], connections)).toEqual([]);
  });
});

describe('resolveExpandedNotebookKeys — filtre legacy (Task 11)', () => {
  it('jette les ids bruts pré-2.0 et garde les clés composites', () => {
    const parsed = [1, 2, `${CONN_A}:5`, `${CONN_B}:7`, 'bare'];
    expect(resolveExpandedNotebookKeys(parsed, ['fallback'])).toEqual([`${CONN_A}:5`, `${CONN_B}:7`]);
  });

  it("retombe sur fallback si aucune clé composite ne survit (tout est pré-2.0)", () => {
    expect(resolveExpandedNotebookKeys([1, 2, 5], ['fallback'])).toEqual(['fallback']);
    expect(resolveExpandedNotebookKeys([], ['fallback'])).toEqual(['fallback']);
  });

  it("retombe sur fallback si l'entrée n'est pas un tableau exploitable", () => {
    expect(resolveExpandedNotebookKeys(null, ['fallback'])).toEqual(['fallback']);
    expect(resolveExpandedNotebookKeys(undefined, ['fallback'])).toEqual(['fallback']);
    expect(resolveExpandedNotebookKeys('not-an-array', ['fallback'])).toEqual(['fallback']);
    expect(resolveExpandedNotebookKeys({ 0: 'x' }, ['fallback'])).toEqual(['fallback']);
  });
});

describe('resolveLastActiveSelection — restauration de la dernière page active', () => {
  it('coup exact : restaure notebook + section + page de la BONNE connexion (collision incluse)', () => {
    const { notebooks, sections, pages } = makeCollisionFixtures();
    const lastKey = buildEntityKey(CONN_B, 1);

    const resolved = resolveLastActiveSelection(lastKey, notebooks, sections, pages);

    expect(resolved).toEqual({
      notebook: notebooks[1],
      section: sections[1],
      page: pages[1],
    });
  });

  it("clé pointant vers une connexion disparue : retombe sur le premier notebook", () => {
    const { notebooks, sections, pages } = makeCollisionFixtures();
    const lastKey = buildEntityKey('ffffffff', 1); // connexion supprimée depuis

    const resolved = resolveLastActiveSelection(lastKey, notebooks, sections, pages);

    expect(resolved).toEqual({
      notebook: notebooks[0],
      section: sections[0],
      page: pages[0],
    });
  });

  it('clé au format pré-2.0 (id brut, sans connId) : retombe sur le premier notebook', () => {
    const { notebooks, sections, pages } = makeCollisionFixtures();

    const resolved = resolveLastActiveSelection('1', notebooks, sections, pages);

    expect(resolved).toEqual({
      notebook: notebooks[0],
      section: sections[0],
      page: pages[0],
    });
  });

  it('rien de stocké (lastKey null) : retombe sur le premier notebook', () => {
    const { notebooks, sections, pages } = makeCollisionFixtures();

    const resolved = resolveLastActiveSelection(null, notebooks, sections, pages);

    expect(resolved).toEqual({
      notebook: notebooks[0],
      section: sections[0],
      page: pages[0],
    });
  });

  it('aucun notebook du tout : tout est null', () => {
    const resolved = resolveLastActiveSelection(null, [], [], []);
    expect(resolved).toEqual({ notebook: null, section: null, page: null });
  });

  it('premier notebook sans section : notebook restauré, section et page à null', () => {
    const notebooks = [{ connId: CONN_A, id: 1, name: 'Vide' }];
    const resolved = resolveLastActiveSelection(null, notebooks, [], []);
    expect(resolved).toEqual({ notebook: notebooks[0], section: null, page: null });
  });

  it('première section sans page : notebook + section restaurés, page à null', () => {
    const notebooks = [{ connId: CONN_A, id: 1, name: 'N' }];
    const sections = [{ connId: CONN_A, id: 1, notebook_id: 1, title: 'S' }];
    const resolved = resolveLastActiveSelection(null, notebooks, sections, []);
    expect(resolved).toEqual({ notebook: notebooks[0], section: sections[0], page: null });
  });

  it("page trouvée mais sa section a été supprimée entretemps : retombe sur le premier notebook", () => {
    const { notebooks, pages } = makeCollisionFixtures();
    // La page CONN_B:1 existe toujours mais sa section a disparu de sectionsData.
    const sections = [];
    const lastKey = buildEntityKey(CONN_B, 1);

    const resolved = resolveLastActiveSelection(lastKey, notebooks, sections, pages);

    expect(resolved).toEqual({
      notebook: notebooks[0],
      section: null,
      page: null,
    });
  });
});
