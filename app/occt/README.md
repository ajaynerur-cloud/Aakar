# app/occt — optional OpenCascade kernel (occt-wasm)

Aakar ships with its own exact kernel (**AakarKernel**, built into `index.html`). This folder adds **OpenCascade** as a second kernel the user can
switch to in the *Exact kernel* panel (**Engine: AakarKernel | OpenCascade**). The choice is remembered.

| file | where it comes from |
|---|---|
| `aakar-occt.mjs` | in the repo — the Aakar binding (calibrates and wraps occt-wasm) |
| `aakar-occt.js` | in the repo — classic-script loader that Aakar's framework looks for |
| `occt-wasm.js`, `occt-wasm.wasm` (+ any other files of the package) | **not committed** — copied from `node_modules/occt-wasm/dist` by `scripts/fetch-occt-wasm.js` |

```
npm install occt-wasm --no-save
node scripts/fetch-occt-wasm.js
npm start
```

The package is **copied as plain files and imported at run time — it is never bundled**, so no esbuild / webpack step is involved (that is what
produced `Could not resolve "node:module"`: occt-wasm's `dist/occt-wasm.js` contains a Node-only import that a browser bundler cannot resolve).

Serving: use the desktop app, or any local web server (`npx serve app`). Browsers refuse to import ES modules from a `file://` page, so double-clicking
`index.html` can only use AakarKernel. If OpenCascade is missing or fails, AakarKernel stays active and the reason is shown in the log of the panel.

Licence: OpenCascade is LGPL-2.1 with the OCCT exception; keep the `occt-wasm.wasm` file separate and replaceable, as it is here.
