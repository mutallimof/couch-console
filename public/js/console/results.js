// An animated podium with confetti for result screens (Phase 55). Pure DOM + GSAP (falls back to a still podium if
// GSAP can't load, or the player prefers reduced motion). The Lottie celebration files from the brief are not in the
// repository yet, so confetti is made here.
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const COLORS = ['#FF5C8A', '#3FA9FF', '#2FD6A4', '#FFC93C', '#FF8A3D', '#9B7BFF'];
let gsapP = null;
const loadGsap = () => (gsapP ||= import('gsap').then((m) => { m.gsap.ticker.lagSmoothing(0); return m.gsap; }).catch(() => null)); // (no lag smoothing: animations keep real time even when a frame is slow)

// entries: the winners in order (1st first), each { face: html (an <img> or avatar), name, sub, color }. Returns the element.
export function podiumHtml(entries) {
  const heights = [11, 8, 6], order = [1, 0, 2]; // 2nd | 1st | 3rd, like on a real podium
  return `<div class="podium" aria-label="Winners">${order.filter((i) => entries[i]).map((i) => {
    const e = entries[i];
    return `<div class="pod pod-${i + 1}" style="--c:${e.color || '#3FA9FF'}"><div class="pod-who"><span class="pod-face">${e.face}</span><b>${esc(e.name)}</b>${e.sub ? `<small>${esc(e.sub)}</small>` : ''}</div>
      <div class="pod-step" style="height:${heights[i]}vh"><span>${i + 1}</span></div></div>`;
  }).join('')}</div>`;
}

// Play the podium in (steps rise, winners drop in with a bounce) and let confetti fall behind it
export async function playPodium(root) {
  const gsap = REDUCED ? null : await loadGsap();
  if (!gsap) return;
  const steps = root.querySelectorAll('.pod-step'), who = root.querySelectorAll('.pod-who');
  gsap.set(who, { opacity: 0, y: -60, scale: 0.6 });
  gsap.from(steps, { scaleY: 0, transformOrigin: '50% 100%', duration: 0.5, ease: 'back.out(1.4)', stagger: 0.12 });
  // 3rd place first, then 2nd, and the winner last
  const byRank = [...who].sort((a, b) => Number(b.parentElement.className.match(/pod-(\d)/)?.[1]) - Number(a.parentElement.className.match(/pod-(\d)/)?.[1]));
  gsap.to(byRank, { opacity: 1, y: 0, scale: 1, duration: 0.55, ease: 'back.out(1.8)', stagger: 0.35, delay: 0.5 });
  setTimeout(() => confetti(root.closest('.kart-results') || root), 1300);
}

// Confetti pieces fall from above the element
export async function confetti(host, count = 70) {
  const gsap = REDUCED ? null : await loadGsap();
  if (!gsap) return;
  const layer = document.createElement('div');
  layer.className = 'confetti-layer';
  host.append(layer);
  const w = host.clientWidth || innerWidth;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('i');
    p.style.cssText = `left:${Math.random() * 100}%;background:${COLORS[i % COLORS.length]};width:${6 + Math.random() * 8}px;height:${10 + Math.random() * 12}px`;
    layer.append(p);
    gsap.fromTo(p, { y: -40, rotation: Math.random() * 360, opacity: 1 }, {
      y: (host.clientHeight || innerHeight) + 60, x: (Math.random() - 0.5) * w * 0.25, rotation: `+=${360 + Math.random() * 540}`, rotationX: 360,
      duration: 2.2 + Math.random() * 1.8, delay: Math.random() * 0.9, ease: 'power1.in', onComplete: () => p.remove() });
  }
  setTimeout(() => layer.remove(), 6500);
}
