// A shared clock for the Party Games. The server's clock is the reference: each device asks for it a few times, keeps the
// answers that came back fastest, and takes the median of its offset (like NTP). "Server time" can then be turned into this
// device's own time and back, so a DRAW! scheduled at server time T lands on every phone at the same moment.

// samples: [{ sent, got, server }] in this device's performance.now() ms and the server's Date.now() ms.
// Returns { offset, rtt }: serverNow = performance.now() + offset (offset is in ms)
export function estimateOffset(samples) {
  const ok = samples.filter((s) => Number.isFinite(s.sent) && Number.isFinite(s.got) && Number.isFinite(s.server) && s.got >= s.sent);
  if (!ok.length) return null;
  const withRtt = ok.map((s) => ({ rtt: s.got - s.sent, offset: s.server - (s.sent + s.got) / 2 })).sort((a, b) => a.rtt - b.rtt);
  const best = withRtt.slice(0, Math.max(1, Math.ceil(withRtt.length / 2))); // the quicker half: their midpoint guess is the most exact
  const offs = best.map((x) => x.offset).sort((a, b) => a - b);
  const mid = offs.length >> 1;
  return { offset: offs.length % 2 ? offs[mid] : (offs[mid - 1] + offs[mid]) / 2, rtt: best[0].rtt };
}

export function createClock(socket, pgTime) {
  let sync = { offset: Date.now() - performance.now(), rtt: Infinity };
  const ask = () => new Promise((resolve) => {
    const sent = performance.now(), timer = setTimeout(() => resolve(null), 2000);
    socket.emit(pgTime, null, (server) => { clearTimeout(timer); resolve({ sent, got: performance.now(), server }); });
  });
  return {
    // ~5 ping-pongs (a little apart), then the best estimate. Safe to call again.
    async sync(rounds = 5) {
      const samples = [...(this.samples || [])];
      for (let i = 0; i < rounds; i++) { const s = await ask(); if (s) samples.push(s); await new Promise((r) => setTimeout(r, 80)); }
      this.samples = samples.slice(-12);
      const est = estimateOffset(this.samples);
      if (est) sync = est;
      return sync;
    },
    now: () => performance.now() + sync.offset,                   // the server's time, ms
    toLocal: (serverMs) => serverMs - sync.offset,                 // a server time -> performance.now() ms on this device
    toServer: (localMs) => localMs + sync.offset,
    get rtt() { return sync.rtt; },
  };
}
