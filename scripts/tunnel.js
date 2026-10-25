// `npm run tunnel`: starts the console AND a free cloudflared tunnel, so phones get a secure https link (needed for motion sensors, the
// camera and the laser pointer). The QR code on the console screen then points at the tunnel. Works the same on Windows, macOS and Linux.
// Without cloudflared installed it only prints how to install it for your system.
import { spawn, spawnSync } from 'node:child_process';
import { platform } from 'node:os';
import { fileURLToPath } from 'node:url';
import '../server/env.js'; // (PORT from .env)

const PORT = process.env.PORT || 3000;

function installHelp() {
  const os = platform();
  console.log('\ncloudflared is not installed (it makes the free https tunnel). Install it once, open a NEW terminal, then run `npm run tunnel` again:\n');
  if (os === 'win32') console.log('  Windows:  winget install --id Cloudflare.cloudflared\n            (or download cloudflared-windows-amd64.exe from https://github.com/cloudflare/cloudflared/releases and put it on your PATH)');
  else if (os === 'darwin') console.log('  macOS:    brew install cloudflared');
  else console.log('  Linux:    https://pkg.cloudflare.com/ has the apt / yum packages (or download the binary from https://github.com/cloudflare/cloudflared/releases),\n            Arch: sudo pacman -S cloudflared');
  console.log('\nNo tunnel wanted? Other ways to get https: `npm run certs` (a certificate for your own Wi-Fi), see "Joining with phones" in README.md.\n');
}

const probe = spawnSync('cloudflared', ['--version'], { encoding: 'utf8', shell: platform() === 'win32' });
if (probe.error || probe.status !== 0) { installHelp(); process.exit(1); }

let server = null;
const tunnel = spawn('cloudflared', ['tunnel', '--no-autoupdate', '--url', `http://localhost:${PORT}`], { shell: platform() === 'win32' });
let started = false;
const seen = (chunk) => {
  const text = String(chunk);
  if (!started) {
    const m = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
    if (m) {
      started = true;
      console.log(`\nTunnel ready: ${m[0]}\nThe QR code on the console screen sends phones there. Open the console on this laptop: http://localhost:${PORT}\n`);
      server = spawn(process.execPath, [fileURLToPath(new URL('../server/index.js', import.meta.url))], { stdio: 'inherit', env: { ...process.env, PUBLIC_URL: m[0] } });
      server.on('exit', (code) => { tunnel.kill(); process.exit(code ?? 0); });
    }
  }
};
tunnel.stdout.on('data', seen);
tunnel.stderr.on('data', seen); // (cloudflared prints its log, including the link, on stderr)
tunnel.on('exit', (code) => { if (!started) console.error(`cloudflared stopped (${code}). Is the internet on?`); server?.kill(); process.exit(code ?? 1); });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { tunnel.kill(); server?.kill(); process.exit(0); });
setTimeout(() => { if (!started) console.log('Still waiting for the tunnel… (needs the internet; press Ctrl+C to stop)'); }, 15000);
