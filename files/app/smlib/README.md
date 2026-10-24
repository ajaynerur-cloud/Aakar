# app/smlib: optional SMLib engine

The **Exact kernel** panel offers three engines: **AakarKernel | OpenCascade | SMLib**. Aakar remembers the one you pick (`aakar.exact.engine`). If the one you pick cannot start, AakarKernel stays active and the panel's *Log* says why.

**SMLib is a commercial C++ library.** It is not open source, not on npm and not redistributable, so Aakar cannot ship it. This folder only holds the slot it plugs into. You need your own SMLib licence and build. Never commit the library, the addon or the `.wasm` to a public repository; `.gitignore` already keeps them out.

## Two ways to plug it in

### A. Native addon (desktop app, recommended for C++)
1. Build a small **N-API addon** (for example with `node-addon-api` and `cmake-js`) that links SMLib and exposes the calls in the table below. Build it for Electron's ABI (`npx electron-rebuild` or `cmake-js --runtime=electron --runtime-version=33.4.11`).
2. Copy `native/index.example.js` to `native/index.js` and point its `require()` at your `.node` file.
3. Run `npm start` and choose **Engine ▸ SMLib**.

How it runs:
- **Where:** `index.js` runs in Electron's **main process** (`main.js` → `loadSmlibNative`). The page calls it over synchronous IPC through `window.aakarDesktop.smlib` (`preload.js`).
- **Shapes:** they stay in the main process. The page only sees handles `{ __sm: id }`, and old intermediates are released after 5000 handles.
- **Packaging:** `app/smlib/**` is unpacked from the asar archive (`asarUnpack`), so `.node` and `.dll` files load in the EXE.

### B. WebAssembly (desktop or web)
1. Compile SMLib plus a thin binding with Emscripten into `aakar-smlib.mjs` (plus its `.wasm`). It is an ES module exporting `{ name, version, init(opts) }`, where `init` returns the kernel described below.
2. Put the files in this folder:
   - **Desktop:** it is served as `aakar-asset://smlib/…`.
   - **Web / local server:** `aakar-smlib.js` (committed) imports it.
3. Check it before packaging with `node tools/occt-selftest.mjs app/smlib/aakar-smlib.mjs`. The same 13 checks OpenCascade must pass apply here.

Aakar tries these routes in order: an already-present `window.AakarSmlibBinding`, then the native addon, then the desktop WebAssembly module, then `smlib/aakar-smlib.js`.

## The kernel contract (the same one OpenCascade's binding implements)
| Call | Returns | Notes |
|---|---|---|
| `box(w, d, h)` | shape | corner at the origin |
| `cylinder(r, h)` | shape | base centred on the origin, axis +Z |
| `sphere(r)` | shape | centred on the origin |
| `translate(shape, [x, y, z])` | shape | |
| `fuse(a, b)`, `cut(a, b)`, `common(a, b)` | shape | |
| `volume(shape)`, `area(shape)` | number | mm³, mm² |
| `mesh(shape, tol)` | `{ positions: Float32Array, indices: Uint32Array }` | tol = chordal deviation in mm |
| `stepExport(shape)` | string | ISO 10303-21 with exact surfaces |
| *optional* `stepImport(text)`, `cone(r1, r2, h)`, `torus(R, r)`, `rotate`, `scale`, `bbox`, `massProps`, `info`, `validate`, `release` | | enable more of the panel (Exact properties, STEP import) |

The panel's **Run self-test** button runs the conformance checks against the active engine: volumes, placement, booleans, area, mesh smoothness, a true `CYLINDRICAL_SURFACE` in STEP, and a STEP round trip.

## Getting SMLib
SMLib was developed by Solid Modeling Solutions, and its manuals are now published on NVIDIA's documentation site. Licensing terms and availability are set by the rights holder. Contact them, or a reseller, for a licence and the C++ SDK.
