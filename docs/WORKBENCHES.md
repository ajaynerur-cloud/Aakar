# Aakar 8.6 – Part, Assembly and Sheet metal workbenches

Three new ribbon tabs sit next to **Model**. Everything is parametric: each step is a feature in the history (double-click to edit, suppress, roll back, undo) and is saved inside the `.aakar.json` project.

Every tab has an **Examples** button that opens a finished worked example in its own project tab.

## Part
| Tool | What it does |
|---|---|
| Sketch / Create / Modify | The normal modelling tools, repeated here so a part can be built in one tab |
| **Hole wizard** | Click a flat face: simple, counterbore, countersink and tapped holes (ISO clearance / tap-drill / head sizes). Later clicks repeat the same hole |
| **Standard parts** | Hex bolt (ISO 4017), socket head cap screw (ISO 4762), hex nut (ISO 4032), washer (ISO 7089), 6xxx deep-groove bearing, dowel pin (ISO 2338) – M3 to M24 |
| **Properties** | Name, part number, revision, designer, description, material (20 materials or custom density), custom properties |
| **Mass properties** | Volume, surface area, mass, centre of gravity, bounding box and the full inertia tensor (exact polyhedral integrals); data-sheet export (HTML / text) |

## Assembly
| Tool | What it does |
|---|---|
| **Assembly panel** | Component list: show / hide, **fix (lock)**, material, move / rotate, isolate, delete; mate list; exploded-view slider |
| Insert part / From project / Standard part | Bring in saved parts (`.aakar.json`), another open project tab, or fasteners |
| **Mates** | Coincident, concentric, distance, angle, **parallel**, **perpendicular**, gear. Fixed components never move – the other one does |
| **Pattern** | Linear or circular copies of a component; every copy is its own component |
| **Interference** | Finds overlapping components (outlined red); coincident contact and fastener fits are ignored |
| **BOM & mass** | Grouped bill of materials with part numbers, materials and masses, assembly mass / COG / inertia; CSV and printable HTML |
| Explode / Section / Measure | Animated exploded view, live section plane, measure |

Part number and material come from each part's *Part → Properties* and travel with the inserted part.

## Sheet metal
1. Sketch a closed outline (holes allowed) → **Base flange** (material, thickness, bend radius, K-factor).
2. **Edge flange** – click a plate edge or the free end of an existing flange: angle (0.5–180°), length (flat or to the outside virtual sharp), radius, K-factor, up / down, start / end offsets for corner relief.
3. **Hem** (180°), **Jog** (offset bend pair), **Cut-out** (sketch on any flat face – plate or flange).
4. **Flat pattern** – unfolded blank with bend lines, bend table (angle, radius, K, bend allowance BA = θ·(R + K·t), bend deduction BD), blank size, area and weight.
   Export **DXF** (layers OUTLINE, HOLES, BEND_UP, BEND_DOWN, NOTES; round holes as true circles), **SVG** and the bend table (CSV).
5. **Unfold 3D** adds the flat blank as a solid beside the folded part.

Materials with default K-factors: mild steel, galvanised steel, stainless 304, aluminium 5052 / 6061, copper, brass.
