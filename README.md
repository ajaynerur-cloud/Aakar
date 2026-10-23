<p align="center"><img src="assets/aakar-logo.png" alt="Aakar" width="420"></p>

# Aakar 8.10.0 - Windows desktop build

*Aakar* (आकार) means **form / shape**. The whole application is the single offline file `app/index.html`. This repository wraps it in
Electron so GitHub can build a Windows `.exe`.

**New in 8.10:** trim loops in STEP · background work with progress · persistent names · Sketch+ (3D sketch, project edges, image trace) ·
optional exact OpenCascade kernel. Details and what was tested: [`docs/WHATS_NEW_8_10.md`](docs/WHATS_NEW_8_10.md). Earlier: [`docs/EARLIER.md`](docs/EARLIER.md).

## Get the EXE (GitHub Actions)
1. Create a GitHub repository and push everything in this folder (keep `.github`).
2. **Actions** tab → **Build Aakar Windows EXE** (runs on push, or **Run workflow**).
3. Download the artifact **Aakar-windows**: `Aakar-Setup-8.10.0.exe` and `Aakar-Portable-8.10.0.exe`.
4. Optional: push a tag `v8.10.0` to attach them to a Release.

**Check the run log for the exact-kernel step.** Green: the EXE contains the exact kernel. Orange with the warning *Exact kernel not
packaged*: the EXE was built without it (everything else identical) and the log shows which of the 13 checks failed. This step is the
first time the real OpenCascade package is exercised - see `occt/README.md`.

## Build locally (Windows, Node 18+)
```
npm install
npm test           # package tests, no network needed
npm run dist       # EXE files in .\dist
npm start          # run without building
npm install --no-save occt-wasm esbuild && npm run occt   # optional exact kernel into app\occt
```

## Files
| Path | Purpose |
|---|---|
| `app/index.html` | The Aakar application |
| `app/occt/` | Exact kernel, filled by the workflow (empty in git) |
| `occt/`, `tools/` | Kernel binding, build tool, self-test |
| `test/run-tests.mjs` | Package tests (asset protocol, build tool, self-test gate) |
| `main.js`, `preload.js`, `prompt*` | Electron shell |
| `docs/`, `assets/`, `build/` | Guides, logos, icons |

Projects save as `<name>.aakar.json`; older `.prism.json` files still open. The EXE is not code-signed: SmartScreen may ask - **More info → Run anyway**.
