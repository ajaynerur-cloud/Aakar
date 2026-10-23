# app/occt — optional OpenCascade kernel (occt-wasm)

Aakar ships with its own exact kernel (**AakarKernel**, built into `index.html`). This folder adds **OpenCascade** as a second kernel the user can
switch to in the *Exact kernel* panel (**Engine: AakarKernel | OpenCascade**). The choice is remembered.

| file | where it comes from |
|---|---|
| `aakar-occt.mjs` | in the repo — the Aakar binding (calibrates and wraps occt-wasm) |
| `aakar-occt.js` | in the repo — classic-script loader that Aakar's framework looks for |
| `package.json` | in the repo — `{"type": "module"}` for Node |
| `index.js`, `occt-wasm.js`, `occt-wasm.wasm` (+ the other files of the package) | **not committed** (see `.gitignore`) — copied from `node_modules/occt-wasm/dist` by `scripts/fetch-occt-wasm.js` |

```
npm install            # occt-wasm 5.7.1 is a pinned devDependency
npm run occt           # copies the runtime into app/occt/ and runs the 13-check self-test
npm start
```

The binding imports the package **facade** `index.js` (it exports `OcctKernel`). `occt-wasm.js` is only the raw Emscripten factory
underneath it; loading that first was the 8.11.1 bug that made the panel say "OpenCascade not available". `package.json` in this folder
marks the files as ES modules so the Node self-test can load them (CI runs Node 20).

The package is **copied as plain files and imported at run time — it is never bundled**, so no esbuild / webpack step is involved (that is what
produced `Could not resolve "node:module"`: occt-wasm's `dist/occt-wasm.js` contains a Node-only import that a browser bundler cannot resolve).

Serving: use the desktop app, or any local web server (`npx serve app`). Browsers refuse to import ES modules from a `file://` page, so double-clicking
`index.html` can only use AakarKernel. If OpenCascade is missing or fails, AakarKernel stays active and the reason is shown in the log of the panel.

Licence: OpenCascade is LGPL-2.1 with the OCCT exception; keep the `occt-wasm.wasm` file separate and replaceable, as it is here.
