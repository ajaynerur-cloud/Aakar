# Exact kernel (optional)

Aakar's own kernel is the default and works fully offline in the single HTML file. With an exact B-rep kernel (OpenCascade compiled to
WebAssembly) installed, **Model ▸ Kernel ▸ Exact kernel** adds exact STEP export (true cylinders / spheres), exact volume and area, an
exact-vs-faceted report, and optionally exact booleans meshed back into normal Aakar solids. This applies to bodies built from primitives
(box, cylinder, sphere) and booleans of them; everything else keeps using the built-in kernel. Any error inside the kernel falls back to the
built-in result.

## How it gets into the EXE
> **8.12:** the workflow no longer uses `tools/build-occt.mjs` / `binding-occt-wasm.mjs`: that route starts by deleting `app/occt`
> (including the committed binding) and its fallback empties the folder, so EXEs shipped without OpenCascade. It now runs
> `npm run occt` = `scripts/fetch-occt-wasm.js` + `tools/occt-selftest.mjs app/occt/aakar-occt.mjs`; see `app/occt/README.md`.
> The text below describes the older route, kept for reference.

The GitHub workflow installs the `occt-wasm` package, runs `tools/build-occt.mjs` (writes `app/occt/`), then `tools/occt-selftest.mjs`.
**The kernel is packaged only if every check passes**; otherwise `app/occt` is emptied and the EXE is built without it (a warning shows on
the run). By hand:

```
npm install --no-save occt-wasm esbuild
node tools/build-occt.mjs
node tools/occt-selftest.mjs        # must end with "all 13 checks passed"
```

The checks (`tools/occt-conformance.mjs`, the same code the app runs from its panel): box / cylinder / sphere volumes, translate,
primitive placement (corner / base at the origin), cut, fuse, common, box area, mesh, smooth cylinder mesh, STEP export with a real
`CYLINDRICAL_SURFACE`, STEP round trip.

## What is and is not verified
`binding-occt-wasm.mjs` was written from the package's README (makeBox, makeCylinder, fuse, cut, common, tessellate, exportStep,
importStep, getVolume) and its Rust docs (makeSphere). `translate` and surface area are **not** confirmed; several likely names are tried and
the error lists them. The binding has not been run against the real package by its author - the first workflow run is that test. If a check
fails, the log names the call; adjust `binding-occt-wasm.mjs` and push again.

Everything around it is tested locally with stand-in kernels: the build tool (with and without esbuild), the self-test gate in both
directions, the desktop asset protocol (`aakar-asset://occt/...`: correct MIME types, nothing outside `app/occt` readable), loading the built
folder through the desktop module route, and the in-app self-test, report and STEP export.

## Another kernel
A binding is either an ES module `app/occt/aakar-occt.mjs` exporting `{ name, version, init(opts) }` (desktop app), or a classic script
`occt/aakar-occt.js` next to `index.html` defining `window.AakarOcctBinding = { name, version, init }` (plain HTML / web server).
`init` returns an object with: `box(w,d,h)`, `cylinder(r,h)`, `sphere(r)` (corner / base / centre at the origin), `translate(h,[x,y,z])`,
`fuse`, `cut`, `common`, `volume(h)`, `area(h)`, `mesh(h,tol) -> {positions, indices, faces?}`, `stepExport(h) -> text`, optional
`stepImport(text)`, `release(h)`.

## Licence
OpenCascade is LGPL-2.1 with the OCCT exception. It stays a separate, replaceable component in `app/occt/` with its notice.
