# Aakar 8.9 – SubD+ (advanced SubD modelling)

A new **SubD+** ribbon tab. Every tool is a normal history feature (double-click to edit, suppress, roll back, undo) and is saved in the `.aakar.json` file. The **Examples** group opens three finished models: *Symmetric form*, *Shell & cut*, *Scan to SubD*.

## The editor (Edit / Sculpt)
Open **Edit** to get the SubD+ editor panel and a selection mode for **Point / Edge / Face**.
- Click selects, **Shift** adds, **Alt-click** an edge selects its whole loop, click on empty space clears. Buttons: All, None, Invert, Grow, Shrink, Loop, Ring, Boundary.
- **Drag** the selection in the 3D view: you see a live preview and the move is stored as a feature.
- **Symmetry** (live): pick the mirror plane; every move, loop, bevel, crease, lattice and sculpt stroke is mirrored. *Check symmetry* reports how many points have a partner; *Make symmetric* keeps the positive half and mirrors it.
- **Soft selection**: neighbouring points follow with a falloff (smooth, linear, sharp, round, root, constant), measured along the surface (does not leak across gaps) or in space. The weights are shown as coloured dots.
- **Crease sharpness**: select edges and use the sliders (0 = smooth, 1 = one level, 4 = hard; fractions give a soft crease). Creased edges are drawn red-orange. Dragging a slider updates one feature in place.

## Topology
| Tool | What it does |
|---|---|
| **Insert loop** | Hover an edge: its ring is highlighted and a yellow line shows the cut; click to insert (1–8 loops). Works through quads, stops at triangles / n-gons; creases are carried across |
| **Slide loop** | Moves the loop through an edge along the edges that cross it (−0.95 … +0.95), no topology change |
| **Bevel** | Replaces selected edges by a strip of a chosen width; corners are filled automatically (valence 3, 4, 5…); optional crease on the new edges |
| **Bridge** | Joins two open boundary loops with quads, with rings in between, tangent strength and twist |

## Deform
| Tool | What it does |
|---|---|
| **Soft move** | Move / rotate / scale the selection numerically, with soft selection and symmetry |
| **Lattice** | Free-form deformation through a lattice (3–9 points per axis): twist, taper, bend, bulge, stretch, plus manual lattice point offsets |

## Sculpt
Brushes: **draw, inflate, smooth, flatten, pinch, crease, grab** with radius, strength, falloff and invert. A stroke is recorded (positions and normals) so it replays exactly; **Add detail** subdivides the cage once so there are enough points to hold the detail.

## Solid
| Tool | What it does |
|---|---|
| **Thicken** | Open SubD → solid with a rim (optionally creased); closed SubD → hollow shell; selected faces can be removed first to make an opening. Thickness is kept normal to the surface at corners |
| **Boolean** | Subtract / add / intersect a SubD with another SubD or a solid; the SubD is evaluated at level 1–4 and the result is a solid body |
| **To NURBS** | Converts the SubD into bicubic NURBS patches: regular areas are **exact**, areas around extraordinary points are approximated and the cage is subdivided until the patches are within the tolerance. Neighbouring patches share the same boundary curve (watertight); option to **sew** them into a solid |

## Remesh
**Import mesh** opens the CAD import window (STL / OBJ). **Quad remesh** turns a closed triangle mesh (a solid body, mesh surface or another SubD) into an all-quad SubD cage:
- *Voxel*: any shape, any topology (holes and handles are kept).
- *Shrink-wrap*: a clean grid for blob-like (star-shaped) shapes.
Both fit the **smooth limit surface** to the mesh and report the deviation (RMS and maximum).

## Known limits
- Features refer to cage points / edges by index: if an earlier step changes the cage topology, later steps that point at removed edges report an error (a partly-missing set is skipped).
- Bevel needs interior edges; very dense groups of adjacent bevels on tiny faces can fail with a clear message.
- To NURBS: corner points of an open cage are approximated; up to 900 patches by default.
- Remesh (voxel) needs a watertight mesh; the cage resolution follows the voxel size, so fine details need more cells. Quads are grid-aligned and have many irregular points.
- Sculpting moves cage points (not the smooth surface), so detail depends on the cage resolution.
