// src/lib/connections.js
//
// NetCodes se connecte à plusieurs bases à la fois. L'invariant central :
// un id de ligne (notebook/section/page) n'est unique QUE dans sa propre
// connexion — deux bases peuvent chacune avoir un notebook `id: 1`. Toute
// comparaison, tout lookup, toute clé React doit donc porter `connId` en
// plus de l'id. Ce module regroupe cette logique de scoping sous forme de
// fonctions pures, testables indépendamment du rendu React.

// --- Tagging -----------------------------------------------------------

// Attache connId à chaque ligne renvoyée par IPC. Ne mute jamais le tableau
// ni les objets d'origine (le spread copie chaque ligne).
export function tagWithConnId(rows, connId) {
  return rows.map(row => ({ ...row, connId }));
}

// --- Clés composites -----------------------------------------------------

// Construit la clé composite "<connId>:<id>" utilisée comme clé React et
// comme clé de state (notebooks développés, dernière page active, etc.).
export function buildEntityKey(connId, id) {
  return `${connId}:${id}`;
}

// Reconstruit { connId, id } à partir d'une clé composite. Hypothèse : un
// connId est toujours 8 caractères hexadécimaux (généré par
// `crypto.randomBytes(4).toString('hex')`, voir electron/settings.js) et un
// id est toujours un entier — ni l'un ni l'autre ne contient jamais ':'.
// On peut donc découper sur le premier ':' sans ambiguïté. Retourne null si
// la clé n'a pas la forme attendue.
export function parseEntityKey(key) {
  if (typeof key !== 'string') return null;
  const sep = key.indexOf(':');
  if (sep === -1) return null;
  const connId = key.slice(0, sep);
  const idPart = key.slice(sep + 1);
  if (connId === '' || !/^\d+$/.test(idPart)) return null;
  return { connId, id: Number(idPart) };
}

// Vrai uniquement pour une clé composite "<connId>:<id>" (id purement
// numérique). Sert à distinguer les clés pré-2.0 (id brut, ex. "5") des
// clés multi-connexion actuelles.
export function isCompositeEntityKey(key) {
  return typeof key === 'string' && /^[^:]+:\d+$/.test(key);
}

// --- Lookups et filtres scopés par connexion ------------------------------

// Trouve une entité par (connId, id) — la seule façon fiable d'identifier
// une ligne quand plusieurs connexions peuvent partager le même id.
export function findByConnAndId(rows, connId, id) {
  return rows.find(row => row.connId === connId && row.id === id) ?? null;
}

// Est-ce que `entity` EST la ligne identifiée par (connId, id) ? Utilisé
// pour les comparaisons "est-ce l'élément actuellement sélectionné" —
// reproduit exactement la sémantique de `entity?.connId === connId &&
// entity?.id === id` (entity peut être null/undefined).
export function matchesConnAndId(entity, connId, id) {
  return entity?.connId === connId && entity?.id === id;
}

// Notebooks d'une connexion donnée.
export function notebooksInConnection(notebooks, connId) {
  return notebooks.filter(n => n.connId === connId);
}

// Sections d'une connexion donnée (sans filtre sur le notebook parent).
export function sectionsInConnection(sections, connId) {
  return sections.filter(s => s.connId === connId);
}

// Sections d'un notebook : connId ET notebook_id doivent correspondre —
// sinon on récupérerait aussi les sections d'un notebook `id` identique
// dans une AUTRE connexion.
export function sectionsOfNotebook(sections, connId, notebookId) {
  return sections.filter(s => s.connId === connId && s.notebook_id === notebookId);
}

// Pages d'une section : même remarque que ci-dessus, avec section_id.
export function pagesOfSection(pages, connId, sectionId) {
  return pages.filter(p => p.connId === connId && p.section_id === sectionId);
}

// Remplace, dans un tableau d'entités multi-connexions, uniquement la
// tranche appartenant à `connId` — les lignes des autres connexions restent
// inchangées. Motif répété après chaque reorder/move : on recharge la liste
// fraîche d'UNE connexion et on la réinjecte dans le state global.
export function replaceConnectionSlice(prevRows, connId, freshRows) {
  return [...prevRows.filter(row => row.connId !== connId), ...freshRows];
}

// --- Connexions ------------------------------------------------------------

// Id de la première connexion à l'état "connected", ou undefined. Sert de
// dernier recours quand aucune connexion explicite n'est disponible (ex.
// création d'un notebook sans connexion sélectionnée).
export function firstConnectedConnectionId(connections) {
  return connections.find(c => c.status.state === 'connected')?.id;
}

// Ne garde, dans une liste d'ids de connexion persistée (ex. connexions
// repliées dans la sidebar), que celles qui existent encore parmi
// `connections` — purge les entrées orphelines après suppression d'une
// connexion.
export function pruneToKnownConnections(ids, connections) {
  const validIds = new Set(connections.map(c => c.id));
  return ids.filter(id => validIds.has(id));
}

// --- Notebooks développés (sidebar) — filtre legacy Task 11 ---------------

// Ne garde que les clés composites "<connId>:<id>" d'une liste précédemment
// persistée dans localStorage ; jette les anciens ids bruts (pré-2.0, ex.
// `[1, 2, 5]`) qui ne peuvent plus jamais matcher une clé "<connId>:<id>".
// Si `parsed` n'est pas un tableau exploitable, ou si rien ne survit au
// filtre, retombe sur `fallback` (adopter des ids pré-2.0 tels quels
// laisserait silencieusement tous les notebooks repliés pour toujours).
export function resolveExpandedNotebookKeys(parsed, fallback) {
  if (!Array.isArray(parsed)) return fallback;
  const composite = parsed.filter(isCompositeEntityKey);
  return composite.length > 0 ? composite : fallback;
}

// --- Résolution de la dernière page active ---------------------------------

// Résout la sélection { notebook, section, page } à restaurer au démarrage
// depuis la clé "<connId>:<pageId>" persistée (`lastActivePageKey`).
//
// - Coup exact : la page existe encore, ainsi que sa section et son
//   notebook (tous les trois dans la même connexion) → on la restaure.
// - Sinon (rien de stocké, clé au format pré-2.0 bare-id, page/section/
//   notebook supprimé ou connexion disparue) : repli sur le premier
//   notebook → sa première section → sa première page, chaque étage étant
//   optionnel (peut retourner section/page à null si le niveau suivant est
//   vide).
// - Si `notebooksData` est vide, retourne tout à null.
//
// Ne fait aucun effet de bord (pas d'appel IPC, pas de lecture/écriture
// localStorage) : à l'appelant de charger les blocks de la page résolue et
// de persister la nouvelle sélection.
export function resolveLastActiveSelection(lastKey, notebooksData, sectionsData, pagesData) {
  const lastPage = lastKey
    ? pagesData.find(p => buildEntityKey(p.connId, p.id) === lastKey)
    : null;
  const lastSection = lastPage
    ? sectionsData.find(s => s.connId === lastPage.connId && s.id === lastPage.section_id)
    : null;
  const lastNotebook = lastSection
    ? notebooksData.find(n => n.connId === lastSection.connId && n.id === lastSection.notebook_id)
    : null;

  if (lastPage && lastSection && lastNotebook) {
    return { notebook: lastNotebook, section: lastSection, page: lastPage };
  }

  if (notebooksData.length > 0) {
    const first = notebooksData[0];
    const firstSection = sectionsData.find(s => s.connId === first.connId && s.notebook_id === first.id) ?? null;
    const firstPage = firstSection
      ? pagesData.find(p => p.connId === firstSection.connId && p.section_id === firstSection.id) ?? null
      : null;
    return { notebook: first, section: firstSection, page: firstPage };
  }

  return { notebook: null, section: null, page: null };
}
