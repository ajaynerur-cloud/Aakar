# Aakar 8.14.0 add-on pack

This pack turns your existing **Aakar_8.12.html** into **Aakar 8.14.0** without retyping the 1.9 MB application.
Everything is plain files you can commit to GitHub.

## Build (needs Node.js, nothing to install)

```
node tools/build-8.14.0.js Aakar_8.12.html            -> Aakar_8.14.0.html
node tools/build-8.14.0.js Aakar_8.12.html --index    -> Aakar_8.14.0.html + index.html
```
Windows: `tools\build-8.14.0.bat Aakar_8.12.html`.
The script syncs the version text (`<title>` and the brand label that still said 8.11.1) and injects
`addons/aakar-8.14-addon.js` before `</body>`. Running it again on its own output replaces the block (idempotent).

## What 8.14.0 adds (where to find it)

| Where | Button | What it does |
|---|---|---|
| Assembly tab → *Configurations* | **Design table** | Paste or import CSV/TSV; columns linked to global parameters; derived columns (`b = 2*d+6`); rules with messages; size series; **Apply** a row (sets the parameters, model regenerates); **Compare all sizes** (volume, surface, bounding size, mass); assembly tables choose a configuration per component; **configuration BOM** (each size listed separately and combined); save/load all tables as .json |
| Model tab → *Export 8.14* | **glTF (.glb)**, **3MF** | Export all visible solids with colours. glTF: Y-up metres. 3MF: millimetres |
| Drawing tab → *GD&T* | **GD&T** | Feature control frames, datum symbols, surface-finish symbols as SVG (download / copy) |

### How a design table drives the model
1. In **Parameters** (existing 8.4 tool) or via the script console, link feature dimensions to parameter names, e.g. `api.link(f, 'w', 'd')`.
2. Header names in the table must equal those parameter names (or set a *param prefix* on the table).
3. **Apply** writes every numeric and derived column as a global parameter.
4. For assemblies: name each component table after the component (`Shaft`, `Bearing`…), then in the assembly table use one column per component whose cells are that component's configuration names; `Bearing#` = quantity.

Examples: `examples/DesignTable_HexBolt.csv`, `_LBracket.csv`, `_ShaftAssembly.csv`.

## Tests
```
node tests/test-core.js                 # 45 checks: expressions, CSV, tables, series, BOM, zip CRC, GLB/3MF, GD&T
python tests/verify.py                  # reads the exported .glb / .3mf with independent code and checks volume + orientation
node tests/test-integration-stub.js     # wiring against a stub of the Aakar host (not the real app)
```

## Known limits (be aware)
* The UI panels were **not run in a real browser** against the full 8.12 file — only the logic and the wiring against a stub were tested. Open the built HTML once and try each button.
* "Compare all sizes" restores the previously applied row if there was one; otherwise the last size stays applied.
* Only solids are measured / exported; NURBS surfaces, SubD cages and BIM objects are skipped by glTF/3MF.
* GD&T output is SVG only; it is not attached to drawing geometry yet.
* Not in this version: persistent topological naming, new mate types, variable-radius solid fillets, GD&T on drawings, CAM, feature recognition, HDRI / PBR render, macros, decimate, topology optimisation, WebGPU.
