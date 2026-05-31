import fs from 'fs';
import path from 'path';
import { app } from 'electron';

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

export function getDbPath() {
  return readSettings().dbPath || null;
}

export function setDbPath(newPath) {
  const s = readSettings();
  s.dbPath = newPath;
  writeSettings(s);
}

export function getDefaultDbPath() {
  return path.join(app.getPath('userData'), 'netcodes.sqlite');
}
