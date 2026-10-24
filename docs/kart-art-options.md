# Turbo Karts: free art options

Everything here is **free**. Nothing is paid, nothing needs an API key. "CC0" = public domain (no credit needed).
"CC BY" = free, but you **must credit** the author (add a line to `THIRD_PARTY_NOTICES.md`).

> **Honest note:** when this was written the build sandbox could not open sketchfab.com, polyhaven.com or
> quaternius.com / kenney.nl (the network proxy refuses them). So **I could not check individual model pages**.
> Below are *search links and exact filter steps*, not hand-picked model URLs I haven't seen. Pick the model you like,
> check its license badge says **CC0** or **CC BY** (not "CC BY-NC" or "Standard"), download **glTF / GLB**, and tell me the
> file path: I wire it in and add the credit.

## What is still weak in Turbo Karts, and what fixes it

| Weakness (see `docs/kart-compare/DIFFERENCES.md`) | Best free fix | Effort |
|---|---|---|
| Karts look like toy cars with a pasted-on driver | A cartoon **go-kart** model (Sketchfab search below, or generate one with Tripo) | one model, I scale and place it |
| Characters are fine but generic | Already Quaternius CC0 (animated). More variety: Quaternius **Ultimate Modular Men/Women** packs (CC0) | download packs |
| Sky is a generated starfield; road is generated asphalt | **Poly Haven** HDRIs and textures (CC0), see the next section: the game already looks for them | download ~10 files |
| Track props are plain (barriers, crowd, signs) | **Kenney** *Racing Kit* (have it), *City Kit*, *Nature Kit* (CC0); Sketchfab prop searches | optional |
| Item boxes/coins look generic | Kenney items in use; or make a custom box with Tripo | small |

## 1. Poly Haven (CC0): skies and textures the game picks up automatically

The code looks in `public/assets/polyhaven/`. If a file is there it is used, if not the generated sky/road stays.
Download from https://polyhaven.com (every asset has a free **CC0** license, no account).

**Skies (HDRI, choose 1K, format `.hdr`)**: https://polyhaven.com/hdris : use the filters *Skies* / *Night* / *Sunrise-sunset*.
Save each as `public/assets/polyhaven/hdri/<track>.hdr` with these names:

| File name | Look to search for |
|---|---|
| `park.hdr` | sunny blue sky, light clouds ("clear sky", "morning") |
| `desert.hdr` | warm, dry, low sun |
| `snow.hdr` | overcast bright / snowy mountains |
| `city.hdr` | dusk or neon-ish city skyline |
| `pirate.hdr` | sunset over the sea |
| `sky.hdr` | high clouds, bright |
| `stadium.hdr` | **night** sky (stars or a dark city) |

**Textures (choose 1K; download the `Diffuse`, `nor_gl` (normal, OpenGL) and `Rough` JPGs)**: https://polyhaven.com/textures
Save in `public/assets/polyhaven/textures/<name>/` as `diff.jpg`, `nor.jpg`, `rough.jpg`:

| Folder | Search for |
|---|---|
| `asphalt/` | "asphalt" (clean road) |
| `grass/` | "grass" |
| `sand/` | "sand" (desert track) |
| `snow/` | "snow" |

License note: Poly Haven asks for no credit (CC0). A thank-you line is already in `THIRD_PARTY_NOTICES.md` once files exist.

## 2. Sketchfab (free, downloadable): search links

Open the link, then in the left filters set **License: CC0** (or **CC BY**), keep **Downloadable** on. On a model page click
*Download 3D model* → choose **glTF** (or GLB). Look at the triangle count (under ~50k is plenty), and the animation tab if you
want a moving driver.

- **Go-karts / cartoon karts** (fixes: karts): https://sketchfab.com/search?features=downloadable&q=cartoon+go+kart&type=models
  and https://sketchfab.com/search?features=downloadable&q=low+poly+kart&type=models
- **Chunky racing cars** (alternative to karts): https://sketchfab.com/search?features=downloadable&q=low+poly+race+car&type=models
- **Track props** (cones, tyre stacks, banners, flags, grandstands): https://sketchfab.com/search?features=downloadable&q=race+track+props&type=models
- **Item box / coin / power-up**: https://sketchfab.com/search?features=downloadable&q=cartoon+item+box&type=models
- **Characters** (if you want to add more than the 14 we have; look for rigged + animated):
  https://sketchfab.com/search?features=downloadable&q=cartoon+character+animated&type=models

**Credits needed for CC BY models:** author name, model title, link, "CC BY 4.0". I add these lines to
`THIRD_PARTY_NOTICES.md` when you give me the files. Do **not** pick anything labelled *NC* (non-commercial), *ND*
(no derivatives) or "Standard"/"Editorial" licenses, or anything that is a Nintendo/other-brand character or kart.

## 3. Tripo (free plan): what to generate

Tripo (https://www.tripo3d.ai) turns a text prompt or one image into a 3D model. The free plan gives a monthly credit allowance;
**free-plan results are normally public and licensed CC BY 4.0, so keep the credit line**. Check the current terms on their
site before using anything beyond this private project. Good things to make (one short prompt each, export **GLB**):

1. **Kart bodies**: "cute chunky cartoon go-kart, big wheels, open cockpit, bright red, low poly, game asset". Make 4-5 colours/shapes. *(fixes: karts)*
2. **Item box**: "glossy rounded cube with a question mark, rainbow shimmer, game pickup". *(fixes: item boxes)*
3. **Trackside props**: "stack of colourful tyres", "inflatable start arch", "traffic cone", "cartoon grandstand section". *(fixes: scenery)*
4. **Hats / accessories** for the characters (helmets, goggles): small models I attach to the head bone. *(fixes: character variety)*

Tips: ask for "single mesh, game ready, clean topology"; models come back un-rigged (fine for karts and props); don't use Tripo
for the animated characters (keep Quaternius for that).

## What I would do first (biggest visible gain for the least work)

1. Download **one kart model** (Sketchfab CC0 search or Tripo) → karts stop looking like toys.
2. Download the **7 HDRIs + asphalt/grass textures** from Poly Haven → skies and ground look real.
3. Everything else is optional polish.
