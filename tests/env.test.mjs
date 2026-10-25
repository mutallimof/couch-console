// The optional .env file, tunnel and test-runner scripts: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseEnv } from '../server/env.js';

test('.env lines: KEY=value, comments, quotes, export, empty values', () => {
  const v = parseEnv(`# a comment
YOUTUBE_API_KEY=abc123
PORT = 4000   # trailing comment
NAME="two words # not a comment"
SINGLE='quoted'
export LAN_IP=192.168.1.20

EMPTY=
bad line without equals
1BAD=x`);
  assert.deepEqual(v, { YOUTUBE_API_KEY: 'abc123', PORT: '4000', NAME: 'two words # not a comment', SINGLE: 'quoted', LAN_IP: '192.168.1.20', EMPTY: '' });
});

test('.env.example documents every setting with empty placeholders, and .env is never committed', () => {
  const example = parseEnv(readFileSync(new URL('../.env.example', import.meta.url), 'utf8'));
  for (const k of ['YOUTUBE_API_KEY', 'PORT', 'HTTPS_PORT', 'LAN_IP', 'PUBLIC_URL', 'DATA_DIR']) assert.ok(k in example, `${k} is in .env.example`);
  assert.ok(Object.values(example).every((v) => v === ''), 'the example holds no real value (no key!)');
  const ignore = readFileSync(new URL('../.gitignore', import.meta.url), 'utf8').split(/\r?\n/);
  assert.ok(ignore.includes('.env'), '.env is in .gitignore');
  assert.ok(ignore.includes('config.json'));
});

test('package.json: a Node version, the tunnel and a test script that does not depend on the shell', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.match(pkg.engines.node, />=\s*20/);
  assert.equal(readFileSync(new URL('../.nvmrc', import.meta.url), 'utf8').trim(), '20');
  assert.equal(pkg.scripts.tunnel, 'node scripts/tunnel.js');
  assert.equal(pkg.scripts.test, 'node scripts/run-tests.mjs');
  for (const [name, cmd] of Object.entries(pkg.scripts)) assert.ok(!/\b(rm|cp|mv|export|sh|bash)\b |&&|\$\(/.test(cmd), `script ${name} is plain node (no shell-only commands): ${cmd}`);
});
