# AakarKernel 1.4.0
- **Freeform (NURBS) solids** (`K.nurbs`): rational B-spline curves and surfaces; extrude, revolve, loft and sweep of curved profiles (lines, true arcs, circles, splines).
  Volume, area, centroid and inertia are integrated on the surfaces (exact to ~1e-15 for circles, spheres, tori, lofts of circles); STEP export with B_SPLINE_SURFACE faces.
  Verified by reading the files with a real OpenCascade (`kernel/test/occt_crosscheck.py`): all valid, volume and area agree.
- **Per-operation OpenCascade fallback** (`K.hybrid`, panel: "+ OpenCascade for hard operations"): AakarKernel stays the engine; an operation it cannot do
  (a boolean that will not close, a concave fillet, a boolean with a freeform solid) is handed to OpenCascade as STEP and read back when analytic.
- STEP reader accepts SURFACE_CURVE / SEAM_CURVE / INTERSECTION_CURVE edges (as written by other CAD systems and OpenCascade).
- App: a loft of two sketches and a sweep along a smooth path (lines, arcs, circles as profile) now carry an exact freeform recipe: exact volume, exact STEP, "exact" in the report.

Not included: NURBS/NURBS booleans in AakarKernel itself (done by OpenCascade when present), fillets/shell/offset of curved bodies in AakarKernel itself,
meshing of arbitrary imported STEP bodies in AakarKernel (OpenCascade meshes them when present), profiles with holes or spline entities in the freeform recipes.

## 1.4.1 additions
- **General tessellator** (`src/65_tess.js`): any B-rep body (imported STEP, results read back from OpenCascade) now has a watertight mesh, so it can be drawn, measured on the mesh, moved and used in booleans. Planes, cylinders, cones, spheres (including whole spheres, caps and seam-cut faces) and tori, with holes. Tested on 12 OpenCascade-written shapes (`test/12_tess.js`): 0 open edges, volume within 0.3 % of OpenCascade. Not handled: a face that wraps around the tube of a torus (reported as an error, not a wrong mesh).
- STEP reader accepts `VERTEX_LOOP` face bounds (whole sphere written by OpenCascade).
- `K.hybrid(...).shell(body, [{dir:[x,y,z]} | {c:[x,y,z]}], thickness)` and `.offset(body, d)` (OpenCascade), tested; recipe steps `shell` / `offset` replay through them.
- Freeform recipes in the app: loft with any number of sections (ruled, or smooth as the faceted loft is built), twisted loft, spline sketch entities (centripetal Catmull-Rom converted exactly to NURBS), loft and sweep of profiles with holes (outer solid minus hole solids: needs OpenCascade as helper), twisted sweep. Every recipe is accepted only if its volume and bounding box agree with the faceted solid.
- Still not done: loft along rails/guides, loft tangent control, sweeps along paths with corners, point/open sections, fillets/shell/offset/NURBS booleans in AakarKernel itself without OpenCascade (they need OpenCascade as helper).

## 1.4.2 additions
- Sweep along a path with corners (`K.nurbs.sweepPieces`): one piece per smooth stretch, mitred sections where they meet; exact on straight pieces. The app uses it for paths with turns above 20 degrees (no twist).
- Loft with tangent control (start/end tangent) and with a point at either end (exact cone-like solids; STEP export of those is refused with a clear message, the mesh and mass properties work).
- Mesher: faces that wind round the tube of a torus (half and quarter tori).
- Still not done: loft along rails/guides, loft through open sections, fillets / shell / offset / NURBS booleans without OpenCascade as helper.

## 1.4.3 additions
- Loft along rails / guides, with reverse / start offset, and through open (edge-chain) sections: the exact solid is skinned through the same rings of points the faceted loft is defined on (exact volume = faceted volume; STEP as degree-1 B-splines across each ring).
- Exact shell in the app (Hollow): with OpenCascade as helper the shell is made exactly and replaces the faceted result when the volumes agree (5 %).
- New feature **Offset body** (Modify group): grows or shrinks an exact body, rounded outside corners (OpenCascade as helper). Recipe steps `shell` / `offset`; `K.hybrid().shell` accepts `{near:[x,y,z]}`.
- **Not done, and not possible as a small change:** shell, offset, general fillets and NURBS booleans inside AakarKernel *without* OpenCascade. These need offset-surface intersection and general surface/surface intersection (a second full modeller). With OpenCascade as helper (desktop build) they work; without it the faceted solid is kept and the log says why.

## 1.5.0 - approximate operations inside AakarKernel (no OpenCascade needed)
`src/88_meshops.js`, `K.meshops`: booleans with freeform (NURBS) solids, shell (closed or with opened faces), offset (grow / shrink) and fillets on general curved bodies.
Method: fine tessellation -> signed-distance grid (exact near the surface, vector sweeps outwards, ray parity for the sign) -> marching tetrahedra -> a real AakarKernel body (planar triangles).  Booleans with a freeform solid first try the exact intersection of the tessellations (sharp creases stay sharp) and fall back to the field method.
- **These results are approximate, and say so**: `K.meshops.isApprox(body)` returns the grid size used; the app logs "approximate (mesh-based, about x mm accuracy)". Accuracy is about one grid cell (default 1/96 of the model size, finer when the wall / radius needs it): measured 0.03 % (offset of a box), 0.3 % (shell), 0.05-0.3 % (freeform booleans).  A wall or radius the grid cannot resolve is refused with an error, never faked.
- Fillets: convex edges by a limited morphological opening, concave edges by a closing, inside a tube around the chosen edges.  Known limit: where the rounded edge ends at other sharp edges, those neighbours are rounded a little too (within about one radius of the end).  Off by default for edges AakarKernel rounds exactly; the Exact panel has "Approximate fillets where no exact one exists".
- Exact operations stay exact; OpenCascade (K.hybrid) is still preferred when present.
