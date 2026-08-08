import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { app, safeStorage } from 'electron';

function getSettingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(getSettingsPath(), 'utf-8'));
  } catch {
    return {};
  }
}

function writeSettings(data) {
  fs.writeFileSync(getSettingsPath(), JSON.stringify(data, null, 2), 'utf-8');
}

// Seules les connexions serveur portent un mot de passe.
function usesPassword(type) {
  return type !== 'sqlite';
}

function encryptPassword(password) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Chiffrement indisponible sur ce système : impossible d'enregistrer un mot de passe.");
  }
  return safeStorage.encryptString(password).toString('base64');
}

function generateId(existingConnections) {
  const taken = new Set(existingConnections.map(c => c.id));
  let id;
  do {
    id = crypto.randomBytes(4).toString('hex');
  } while (taken.has(id));
  return id;
}

// Champs conservés tels quels dans settings.json (jamais `password` en clair).
function toStored(cfg, passwordEnc) {
  const stored = { id: cfg.id, name: cfg.name, type: cfg.type };
  if (cfg.type === 'sqlite') {
    stored.file = cfg.file;
  } else {
    stored.host = cfg.host;
    stored.port = cfg.port;
    stored.database = cfg.database;
    stored.user = cfg.user;
    if (passwordEnc) stored.passwordEnc = passwordEnc;
  }
  return stored;
}

// Vue publique : jamais passwordEnc.
function toPublic(stored) {
  const { passwordEnc, ...pub } = stored;
  return pub;
}

export function listConnections() {
  return (readSettings().connections ?? []).map(toPublic);
}

export function getConnectionForOpen(id) {
  const stored = (readSettings().connections ?? []).find(c => c.id === id);
  if (!stored) throw new Error(`Connexion inconnue : ${id}`);
  const cfg = toPublic(stored);
  if (stored.passwordEnc) {
    cfg.password = safeStorage.decryptString(Buffer.from(stored.passwordEnc, 'base64'));
  }
  return cfg;
}

export function addConnection(cfg) {
  const s = readSettings();
  const id = generateId(s.connections ?? []);
  const passwordEnc = usesPassword(cfg.type) && cfg.password ? encryptPassword(cfg.password) : undefined;
  const stored = toStored({ ...cfg, id }, passwordEnc);
  s.connections = [...(s.connections ?? []), stored];
  writeSettings(s);
  return toPublic(stored);
}

export function updateConnection(id, cfg) {
  const s = readSettings();
  const existing = (s.connections ?? []).find(c => c.id === id);
  if (!existing) throw new Error(`Connexion inconnue : ${id}`);
  const passwordEnc = usesPassword(cfg.type) ? (cfg.password ? encryptPassword(cfg.password) : existing.passwordEnc) : undefined;
  const stored = toStored({ ...cfg, id }, passwordEnc);
  s.connections = s.connections.map(c => (c.id === id ? stored : c));
  writeSettings(s);
  return toPublic(stored);
}

export function removeConnection(id) {
  const s = readSettings();
  s.connections = (s.connections ?? []).filter(c => c.id !== id);
  writeSettings(s);
}

// Au premier lancement 2.0.0 : convertit l'ancien réglage mono-base.
export function migrateLegacyDbPath() {
  const s = readSettings();
  if (s.connections && s.connections.length > 0) {
    if (s.dbPath) { delete s.dbPath; writeSettings(s); }
    return;
  }
  const file = s.dbPath || path.join(app.getPath('userData'), 'netcodes.sqlite');
  s.connections = [{
    id: generateId(s.connections ?? []),
    name: 'Base locale',
    type: 'sqlite',
    file,
  }];
  delete s.dbPath;
  writeSettings(s);
}
