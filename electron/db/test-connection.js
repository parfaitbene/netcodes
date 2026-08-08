// Logique de décision pour `connections:test`, isolée dans un module pur et
// testable (main.js est un point d'entrée Electron non importable sous vitest).
//
// Règle de sécurité : un mot de passe résolu depuis le stockage local ne doit
// JAMAIS être envoyé vers une cible choisie par le renderer. `cfg` provient
// intégralement du renderer (potentiellement compromis) ; seul `cfg.id`
// permet de retrouver un secret déjà enregistré, et ce secret ne peut être
// réutilisé que si l'endpoint testé (host/port/database/user, ou file pour
// sqlite) correspond EXACTEMENT à celui pour lequel ce secret a été stocké.
// Sinon, un renderer compromis pourrait énumérer les ids via
// `connections:list` (sans secret requis) puis demander de « tester » un id
// réel avec un host/port arbitraire : le process main se connecterait alors
// à un serveur attaquant avec un vrai mot de passe.
//
// La même règle s'applique à `connections:update` (voir
// `electron/settings.js::updateConnection`), qui réutilise `endpointMatches`
// ci-dessous : sans elle, un renderer compromis pourrait persister une
// nouvelle cible (host/port/db/user) tout en conservant le mot de passe déjà
// stocké — pire que le test, puisque ça se persiste (finding 1 de la revue).

function normalize(value) {
  return typeof value === 'string' ? value.trim() : value;
}

function samePort(a, b) {
  return Number(a) === Number(b);
}

// Détermine si l'endpoint envoyé par le renderer correspond exactement à
// celui de la configuration stockée (seul cas où réutiliser le mot de passe
// stocké est sûr). Exportée pour être partagée avec `updateConnection`
// (`electron/settings.js`), qui n'a besoin que des champs déjà en clair de
// l'enregistrement stocké (host/port/database/user/file) — pas du mot de
// passe déchiffré — donc du même objet `stored` que `resolveTestConfig`.
export function endpointMatches(cfg, stored) {
  if (normalize(cfg.type) !== normalize(stored.type)) return false;

  if (cfg.type === 'sqlite') {
    return normalize(cfg.file) === normalize(stored.file);
  }

  return (
    normalize(cfg.host) === normalize(stored.host)
    && samePort(cfg.port, stored.port)
    && normalize(cfg.database) === normalize(stored.database)
    && normalize(cfg.user) === normalize(stored.user)
  );
}

/**
 * Décide quelle configuration utiliser pour une connexion de test éphémère.
 *
 * @param {object} cfg - Configuration fournie par le renderer (jamais de confiance).
 * @param {(id: string) => object} loadStored - Résout la configuration stockée
 *   (avec mot de passe déchiffré) pour un id, ex. `getConnectionForOpen`.
 * @returns {{ ok: true, config: object } | { ok: false, error: string }}
 */
export function resolveTestConfig(cfg, loadStored) {
  // Le renderer a fourni le mot de passe lui-même : cible et secret viennent
  // de la même source, rien n'est emprunté au stockage. Sûr par construction.
  if (cfg.password) {
    return { ok: true, config: cfg };
  }

  // Pas de mot de passe fourni, mais un id connu : on ne réutilise le secret
  // stocké que si la cible envoyée correspond exactement à la cible stockée.
  if (cfg.id) {
    let stored;
    try {
      stored = loadStored(cfg.id);
    } catch {
      stored = null; // id inconnu / config neuve : on retombe sur le cas par défaut
    }

    if (stored) {
      if (!endpointMatches(cfg, stored)) {
        return { ok: false, error: 'Saisissez le mot de passe pour tester une autre cible.' };
      }
      return { ok: true, config: { ...cfg, password: stored.password } };
    }
  }

  // Ni mot de passe ni config stockée exploitable : on tente tel quel, le
  // pilote signalera lui-même l'échec d'authentification le cas échéant.
  return { ok: true, config: cfg };
}
