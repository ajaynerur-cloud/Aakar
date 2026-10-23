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
