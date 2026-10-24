// The games and channels on the menu. The server lists every <name>.game.json it finds
// (see /api/apps in server.js); each game's code is then loaded on its own, so a game
// with a bug only breaks its own tile ("Couldn't load"), never the whole console.

const WARNING_ICON = `<svg viewBox="0 0 48 48" width="64" height="64" aria-hidden="true" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
  <path d="M24 6 L44 40 H4 Z"/><path d="M24 19v10"/><circle cx="24" cy="34" r="1" fill="#fff"/>
</svg>`;

// A stand-in app for a game that failed to load: its tile opens a short explanation.
function brokenApp(meta, error) {
  let api;
  return {
    id: meta.id,
    title: meta.title,
    color: '#8A94A6',
    icon: WARNING_ICON,
    broken: true,
    maxPlayers: 1,
    mount(container, gameApi) {
      api = gameApi;
      container.innerHTML = `<div class="broken-app"><h1>Couldn't load ${meta.title}</h1>
        <p>The rest of the console works fine. Check the laptop terminal or the browser console (F12) for the error.</p>
        <code></code><p>B = back to the menu</p></div>`;
      container.querySelector('code').textContent = String(error).slice(0, 300);
      api.onButton(({ button, state }) => { if (state === 'down' && button === 'B') api.exit(); });
    },
    unmount() {},
  };
}

export async function loadApps() {
  let list = [];
  try {
    list = await (await fetch('/api/apps', { cache: 'no-store' })).json();
  } catch (err) {
    console.error('Could not get the list of games', err);
    return [];
  }
  const loaded = await Promise.allSettled(list.map((meta) =>
    (meta.broken ? Promise.reject(new Error(meta.broken)) : import(meta.module)).then((m) => m.default)));
  return loaded.map((r, i) => {
    // (the folder and order come from the game's .game.json)
    if (r.status === 'fulfilled' && r.value?.mount) { r.value.folder = list[i].folder; r.value.order = list[i].order; return r.value; }
    const error = r.status === 'rejected' ? r.reason : new Error('The file has no game in it (no default export with mount)');
    console.error(`Couldn't load ${list[i].title}:`, error);
    return { ...brokenApp(list[i], error?.message || error), folder: list[i].folder, order: list[i].order };
  });
}
