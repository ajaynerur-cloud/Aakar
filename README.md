# Aakar 8.17.1 — what goes into Git

## Upload this (it is the whole app)
`index.html`  → repo root, replacing the existing index.html.

AakarKernel 1.1 and every tool below are **built into index.html** (plain JavaScript, nothing is loaded separately),
so GitHub Pages and the Electron + GitHub Actions EXE build keep working with index.html alone.

## Optional: readable source copies (src/)
The same code, extracted from index.html so it can be browsed and diffed in Git. They are NOT loaded by the app:
if you edit one, copy the change back into index.html (inside the matching `<script id=...>` block).

| File | What it is |
|---|---|
| src/kernel/aakar-kernel-core.js | AakarKernel core (analytic B-rep, booleans, mass properties, STEP) — `<script id="aakar-kernel">` |
| src/kernel/aakar-kernel-wire.js | Wires the kernel into the app, engine switch (AakarKernel / OpenCascade / SMLib) |
| src/kernel/aakar-kernel-1.1-clash.js | 1.1 additions: clash checks, feature list, version 1.1.0 |
| src/kernel/aakar-kernel-1.1-construct-engine.js | 1.1 construction maths (planes, axes, points, coordinate systems, sections, curve/mesh intersection) |
| src/reference/* | Reference geometry + Curves + Instant3D + tool-row scroll chevrons (8.16) |
| src/surface/surface-tools-engine.js | 8.17: Planar surface · Trim surface by surface · Mid-surface · Radiate surface · Knit |
| src/surface/surface-tools-toolbar.js | Toolbar group "Surface tools" (NURBS and NURBS+ tabs) |
| src/solid/solid-face-tools-engine.js | 8.17: Delete face (heal / open shell) · Replace face (plane or surface) on solids |
| src/solid/solid-face-tools-toolbar.js | Toolbar group "Face tools" |

The 8.17 modules are inside `<script id="aakar-ref-js">` at the end of index.html.

## Self-test (browser console)
`CAD.exact.selfTest()` → 22 of 22 passed.
