# Aakar 8.12: UI styles and merged workspaces

## UI style picker
A picker opens the first time Aakar starts, and the **UI** button in the top bar reopens it. The choice is stored in `localStorage` (`aakar.uiSkin`).

| Style | What it looks like |
|---|---|
| Classic | The 8.11.1 look, unchanged |
| Studio (option 1) | Navy, rounded cards, pill workspace bar, sub-tabs block, selection bar at the bottom |
| Graphite (option 2) | Neutral grey, DESIGN ▾ switcher, icon-only toolbar, floating browser and inspector, ViewCube |
| Pro (option 3) | Fusion-style charcoal, DESIGN ▾ switcher, big labelled blue icons, full-height browser, timeline row, ViewCube |

To switch from code, call `AAKAR_UI.set('classic' | 'studio' | 'graphite' | 'pro')` or `AAKAR_UI.open()`.

## Merged workspaces (Studio, Graphite and Pro)
The 13 ribbon tabs become 9 workspaces, and the old "+" tabs become sub-tabs:

| Workspace | Sub-tabs (original ribbon tabs) |
|---|---|
| Design | Solid (`model`) · Part (`part`) · Part+ (`partx`) |
| Surface | NURBS (`surface`) · NURBS+ (`nurbsx`) |
| SubD | SubD (`subd`) · SubD+ (`subdx`) |
| Sheet metal, Assembly, BIM, Analysis, Drawing, Render | One tab each |

The original `#ribbon` stays in the DOM, hidden. Workspace and sub-tab buttons simply click its buttons, so `P.setTab`, shortcuts and plug-ins keep working. A MutationObserver keeps the new bars in sync. Any ribbon tab added later by a plug-in appears as its own workspace.

## ViewCube
Clicking TOP, FRONT or RIGHT triggers the existing view buttons, and the buttons beneath it run home (iso), fit and ortho/persp.

## Implementation
All of the change is in `app/index.html`:
- One hook line after `const BG = …` exposes the viewport background and body palette (`window.__aakarView`). This lets each style recolour the 3D view without touching the renderer.
- One self-contained block before `</body>`, between `<!--AAKAR-UI-SKINS-START-->` and `<!--AAKAR-UI-SKINS-END-->`. Deleting that block and the hook line restores 8.11.1 exactly.

## OpenCascade now ships in the EXE
The Exact kernel panel said "OpenCascade not available — AakarKernel stays active" for three reasons:
1. **Wrong file loaded:** `app/occt/aakar-occt.mjs` loaded `occt-wasm.js` (the raw Emscripten factory) before `index.js` (the `OcctKernel` facade), so the kernel had none of `makeBox`, `fuse` and the rest. It now loads `index.js` first.
2. **Old build route:** the active workflow still used the old esbuild route (`tools/build-occt.mjs`). That route starts by deleting `app/occt` (including the committed binding), bundles the older `occt/binding-occt-wasm.mjs`, and when anything fails the fallback step empties `app/occt`. The workflow now copies the package as plain files (`scripts/fetch-occt-wasm.js`) and gates it on the 13-check self-test. On failure it removes only the runtime files.
3. **Package not installed by CI:** `occt-wasm` was not a dependency. It is now pinned (`5.7.1`) in `devDependencies`, so `npm ci` installs it.

Verified with occt-wasm 5.7.1:
- **Node self-test:** 13/13.
- **Browser over HTTP:** 13/13, and box and cylinder bodies report as exact.
- **`electron .`:** 13/13.
- **Packaged build:** 13/13, loaded from `app.asar.unpacked`.

To build locally, run `npm install`, then `npm run occt`, then `npm start` (or `npm run dist`).

## NURBS+: G3 continuity
Blend, Match and the Continuity check now go up to **G3**, where the rate of change of curvature also matches. The join line is drawn blue at G3. See *G3 (8.12)* in `docs/NURBS_PLUS.md`.
- **Blend G3:** a degree-7 cross section. A test pair of curved panels measures 0 % curvature-rate difference at G3, against about 100 % at G2.
- **Match G3:** moves 4 control rows. The target needs at least 5 rows and degree 3 or more across the edge.
- **Class-A example:** opens as a G2 blend as before. Switch it to G3 in the feature dialog.

## SMLib as a third exact-kernel engine
The Exact kernel panel now offers **Engine: AakarKernel | OpenCascade | SMLib**, and Aakar remembers the choice. SMLib is a commercial C++ library, so it is **not shipped**. You plug in your own licensed build, and if none is installed AakarKernel stays active. The log says why.
- **Native route (desktop):** `app/smlib/native/index.js` wraps an N-API addon. It runs in Electron's main process, and the page calls it over synchronous IPC (`window.aakarDesktop.smlib`, with handles `{ __sm }`). `index.example.js` is the template.
- **WebAssembly route:** `app/smlib/aakar-smlib.mjs`, served as `aakar-asset://smlib/`. On the web it loads through `smlib/aakar-smlib.js`.
- **Contract and self-test:** the same as OpenCascade (13 checks). See `app/smlib/README.md`.
- **Repository:** `.gitignore` keeps the licensed SMLib files out of git, and `asarUnpack` includes `app/smlib/**`.
- **Tested with a stand-in kernel (occt-wasm) in the SMLib slot:**
  - native route in Electron: 13/13 self-test, the choice survives a restart, and box and cylinder are exact with exact STEP;
  - WebAssembly route in the browser: 13/13;
  - SMLib missing: it falls back cleanly.
  - `npm test` has 9 new checks for the main-process loader and IPC handles.
