// `npm run certs`: makes a local HTTPS certificate with mkcert, so phones on your Wi-Fi
// can connect straight to this laptop (no cloudflared tunnel). Run it again if your
// laptop's Wi-Fi address changes.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';

const run = (args) => execFileSync('mkcert', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();

try {
  run(['-help']);
} catch {
  console.error('mkcert was not found. Install it first (see "Local setup" in README.md), then open a NEW terminal.');
  process.exit(1);
}

// Every IPv4 address this laptop has on a network (Wi-Fi, cable)
const ips = Object.values(networkInterfaces()).flat()
  .filter((a) => a && a.family === 'IPv4' && !a.internal).map((a) => a.address);

mkdirSync('certs', { recursive: true });
console.log('1/3  Installing the local certificate authority (Windows may ask you to confirm)…');
run(['-install']);
console.log(`2/3  Making a certificate for: localhost, 127.0.0.1, ${ips.join(', ') || '(no network found!)'}`);
run(['-key-file', join('certs', 'key.pem'), '-cert-file', join('certs', 'cert.pem'), 'localhost', '127.0.0.1', ...ips]);
// The public part of the authority, so phones can download and trust it (never the key!)
copyFileSync(join(run(['-CAROOT']), 'rootCA.pem'), join('certs', 'rootCA.crt'));
console.log('3/3  Done! Restart the server with `npm start`. It will print the address to open.');
console.log('Each phone must trust the certificate once. See "Local setup" in README.md.');
