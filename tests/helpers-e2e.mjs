// Shared setup for the browser tests: finds Playwright, starts a throw-away server, launches WebKit (iPhone engine) when it is
// installed and Chromium otherwise.
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
export function findPlaywright() {
  for (const where of [process.env.PLAYWRIGHT_PATH, 'playwright', '/opt/node22/lib/node_modules/playwright'].filter(Boolean)) {
    try { return require(where); } catch { /* next */ }
  }
  return null;
}

export async function startServer(port, extraEnv = {}) {
  const server = spawn(process.execPath, ['server/index.js'], {
    cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: String(port), HTTPS_PORT: String(port + 1), DATA_DIR: `${tmpdir()}/couch-test-${port}`, ...extraEnv }, stdio: 'pipe',
  });
  await new Promise((resolve) => server.stdout.on('data', (d) => { if (String(d).includes('running at')) resolve(); }));
  return server;
}

export async function launchPhoneBrowser(pw) {
  try { return { browser: await pw.webkit.launch(), engine: 'webkit' }; } catch { return { browser: await pw.chromium.launch(), engine: 'chromium' }; }
}

export const PHONES = [[375, 667], [393, 852], [430, 932]];
