# Cleanup log (Part 9 of the overnight run)

Every deletion, with the proof that it was unused. Nothing here is needed by the running app, the tests or the scripts
(checked by an import-graph scan of every JS module, a name search for every asset, and the full test suite).

## Deleted
| What | Why it was safe |
|---|---|
| `public/assets/quaternius-characters/` (14 models, License.txt, 27 MB) | The 14 Quaternius racers were replaced by the 8 KayKit characters in Part 3; no code loads these files. |
| `public/assets/polyhaven/hdri/` (5 sky pictures, 32 MB) | The photographic skies were replaced by code-built skies in Part 2 (`skyFor` / `skyDome` had no caller). |
| `public/assets/polyhaven/textures/asphalt`, `grass`, `snow`, `concrete/pavement_02*`, and the `.gltf` / `.bin` wrappers | Only `concrete_pavement_03` (the Grand Stadium road) is loaded; every other road and ground is generated. |
| `public/assets/sounds/kenney/`: 348 sound files + the whole `ui/` pack + `.url` shortcuts | `sound-map.js` uses 20 sounds; the rest were never referenced. The three packs still used keep their `License.txt`. |
| `public/assets/car-kit/Models/GLB format/vehicle-{monster-truck,racer-low,suv,truck}.glb` | No kart or prop names them. |
| `public/assets/lotties/` (`Confetti.json`, `Trophy.json`) and the `lottie-web` script / route / npm package | Nothing ever loaded them (confetti is drawn with GSAP). |
| `public/assets/logo-flat.svg` | Unreferenced. |
| `docs/screenshots/*` (old audit, before/after, p44-p46, style board, phone gallery shots, ... 78 files) | Progress and comparison pictures from earlier phases; replaced by 11 final pictures + `tracks/`. |
| `docs/kart-compare/` (9 files) | Before/after pictures of kart effects from an earlier phase. |
| `public/js/` (now empty) | Everything moved (see below). |

## Trimmed (not deleted)
- `public/games/turbo-karts/karts-polyhaven.js`: only the stadium concrete loader is left (sky / road / ground helpers had no caller).
- `/api/polyhaven` in `server/index.js`: lists textures only.

## Moved (history kept with `git mv`)
- `server.js` -> `server/index.js` (paths are now found from the repo root).
- `public/js/console/*` -> `public/console/`, `.../games/` -> `public/games/`, `.../channels/` -> `public/apps/`,
  `public/js/remote/` -> `public/phone/`, `public/js/shared/` -> `public/shared/`, `public/js/tools/` -> `public/tools/`.
- `CLAUDE.md` -> `.claude/CLAUDE.md`; HANDOFF, PLAN, PLAN-PARTY, REBUILD-PLAN, REFERENCE-AUDIT, DECISIONS, STYLE,
  kart-art-options, style-board -> `.claude/docs/`.

## Added
`docs/GUIDE.md` (the old README, updated), `docs/TEST-TOMORROW.md`, new `README.md`, final `docs/screenshots/`.


## Part 5 of the fix-and-finish run (Turbo Karts pilots and toy karts)
Deleted (the racers and karts are modelled in code now; each name was searched in `public/`, `scripts/`, `tests/` and `server/`: no reference left, full suite green):
- `public/assets/cast/{barbarian,mage,rogue,rogue-hooded,skeleton-mage,skeleton-rogue,skeleton-warrior}.glb` (only `knight.glb` stays: the home hero icon)
- `public/assets/car-kit/Models/GLB format/vehicle-{speedster,vintage-racer,drag-racer,racer}.glb`
- `scripts/build-cast.mjs` (it only built the cast files above)

## Part 6 of the fix-and-finish run (News replaces On This Day)
Deleted: `public/apps/on-this-day.game.json` (the old tile; the code lives on as the "Today in History" tab inside News) and `public/assets/icons/on-this-day.png` (the old tile icon, replaced by `news.png`). Nothing else referenced either.
