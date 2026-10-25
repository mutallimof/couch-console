// Boot animation shown when the console page opens (about 2.6 s), made with GSAP (Phase 55).
// The logo (original artwork): a glossy sofa, two cushions and a backrest, with a play triangle above it.
// The cushions bounce in one after the other, the triangle pops and glows, the name slides up.
// Click, press a key, or press any phone button to skip it. Without GSAP (or with reduced motion) it just fades.

const DURATION_MS = 2600;
const REDUCED_MS = 1100;

// The logo as an inline SVG (the same drawing as public/assets/logo.svg)
export function logoSvg(size = 250) {
  return `<svg class="boot-logo" viewBox="0 0 170 150" width="${size}" height="${size * 150 / 170}" aria-hidden="true">
    <defs><linearGradient id="logo-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFB36E"/><stop offset=".6" stop-color="#FF8A3D"/><stop offset="1" stop-color="#E86F22"/></linearGradient></defs>
    <circle class="logo-halo" cx="85" cy="30" r="32" fill="#3FA9FF" opacity=".22"/>
    <path class="logo-play" d="M72 14 104 31 72 48z" fill="#3FA9FF" transform="translate(4 -1)"/>
    <g class="logo-sofa">
      <rect class="logo-back" x="12" y="62" width="146" height="62" rx="26" fill="url(#logo-g)"/>
      <rect class="logo-arm" x="0" y="82" width="38" height="60" rx="18" fill="url(#logo-g)"/>
      <rect class="logo-arm" x="132" y="82" width="38" height="60" rx="18" fill="url(#logo-g)"/>
      <rect class="logo-cushion" x="38" y="84" width="46" height="40" rx="16" fill="#FFC48A"/>
      <rect class="logo-cushion" x="86" y="84" width="46" height="40" rx="16" fill="#FFC48A"/>
      <rect x="18" y="68" width="134" height="16" rx="8" fill="#fff" opacity=".35"/>
      <rect x="22" y="132" width="14" height="14" rx="5" fill="#C65E1B"/><rect x="134" y="132" width="14" height="14" rx="5" fill="#C65E1B"/>
    </g>
  </svg>`;
}

export function playBoot({ sound } = {}) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const el = document.createElement('div');
  el.className = 'boot theme-bg';
  el.innerHTML = `
    ${logoSvg(260)}
    <h1 class="boot-title" aria-label="couch console"><span class="w1">couch</span> <span class="w2">console</span></h1>
    <p class="boot-tag">Grab your phone</p>
    <p class="boot-skip">Press any button to skip</p>`;
  document.body.append(el);
  let tl = null;
  if (!reduced) {
    import('gsap').then(({ gsap }) => {
      if (done) return;
      const q = (s) => el.querySelectorAll(s);
      tl = gsap.timeline({ defaults: { ease: 'back.out(1.7)' } });
      tl.from(q('.logo-back, .logo-arm'), { scale: 0.4, opacity: 0, transformOrigin: '50% 100%', duration: 0.5, stagger: 0.08 })
        .from(q('.logo-cushion'), { y: -70, opacity: 0, duration: 0.55, stagger: 0.18, ease: 'bounce.out' }, 0.25)
        .from(q('.logo-play'), { scale: 0, rotation: -60, opacity: 0, transformOrigin: '50% 50%', duration: 0.5 }, 0.95)
        .from(q('.logo-halo'), { scale: 0.2, opacity: 0, transformOrigin: '50% 50%', duration: 0.7 }, 1.0)
        .to(q('.logo-halo'), { opacity: 0.45, scale: 1.2, transformOrigin: '50% 50%', duration: 0.5, yoyo: true, repeat: 1, ease: 'sine.inOut' }, 1.4)
        .from(q('.boot-title span'), { y: 40, opacity: 0, duration: 0.5, stagger: 0.12 }, 1.05)
        .from(q('.boot-tag'), { y: 16, opacity: 0, duration: 0.4, ease: 'power2.out' }, 1.5);
    }).catch(() => {});
  }
  // A short chime as the logo lands, if the browser already allows sound
  const chime = setTimeout(() => sound?.play('start'), reduced ? 0 : 900);

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(chime);
    tl?.kill();
    el.classList.add('boot-out');
    setTimeout(() => el.remove(), 320);
    removeEventListener('pointerdown', finish);
    removeEventListener('keydown', finish);
  };
  addEventListener('pointerdown', finish);
  addEventListener('keydown', finish);
  setTimeout(finish, reduced ? REDUCED_MS : DURATION_MS);
  return { skip: finish, get playing() { return !done; } };
}
