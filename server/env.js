// Reads the optional `.env` file in the project folder (KEY=value lines, # comments, "quotes" allowed) into process.env.
// A value that is already set in the real environment wins, and without a .env file nothing changes: every setting is optional.
// (Imported first by server/index.js, so the settings are in place before anything else reads them.)
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function parseEnv(text) {
  const out = {};
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"') && v.length > 1) || (v.startsWith("'") && v.endsWith("'") && v.length > 1)) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, ''); // a trailing comment after an unquoted value
    out[m[1]] = v;
  }
  return out;
}

export function loadEnv(path = fileURLToPath(new URL('../.env', import.meta.url))) {
  if (!existsSync(path)) return {};
  const values = parseEnv(readFileSync(path, 'utf8'));
  for (const [k, v] of Object.entries(values)) if (process.env[k] === undefined && v !== '') process.env[k] = v; // (an empty value = not set)
  return values;
}

loadEnv();
