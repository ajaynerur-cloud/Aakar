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

## 1.5.1 - holes in freeform solids and an exact through-hole cut
- `K.nurbs.extrude/loft/sweep` accept `{outer, holes}`: planar caps carry the holes (Green-theorem mass properties, mesh with holes, STEP `FACE_BOUND`, transforms).
- `K.nurbs.cutPrism(a, b)`: exact cut of an extruded freeform solid by a parallel box/cylinder/prism that passes through it inside the profile. Result is the same extrusion with one more hole (exact, no meshing). Used automatically by `K.cut` and the hybrid subtract; other cases keep the labelled approximate path.
- Blind pockets: the same tool stopping inside the solid (from either end) gives an exact pocket: outer skin + pocket walls + planar floor + top cap with the pocket as a hole (STEP valid in OpenCascade). `topo.caps` may now carry `refs` so planar faces can share edges with any part.
- App: loft and sweep with holes (sketch regions with inner loops) are built with native holes, so they no longer need OpenCascade; the subtraction recipe is only a fallback.

## 1.5.2 - exact slanted end cuts, chained exact cuts
- `K.nurbs.prismSolid(profile, vec, lo, hi, pockets)`: an extrusion whose two ends are planes (perpendicular or slanted), with through-holes and blind pockets. Each side is a ruled patch between the two projected profile curves (an affine projection of a NURBS curve is the same NURBS), so everything stays exact without trimmed faces.
- `K.nurbs.cutHalfSpace(a, p, n)` and `cutPlanarTool(a, b)`: cutting such a solid with a plane, or with a convex flat-faced tool of which one face reaches the solid (rotated box, wedge), is exact when the plane crosses every side. `cutExact` = parallel prism cut, else this. Used first by `K.cut` and the hybrid subtract.
- Through-holes, pockets (from either end, also under a slanted end) chain in any order and survive move, mirror and STEP export.
- Not covered (needs trimmed faces): a plane or tool that leaves through the side of the solid, non-parallel cylinders/boxes, freeform-on-freeform.

## 1.6.0 - trimmed freeform faces and general plane cuts (exact to ~1e-10, tolerance-based like any B-rep kernel)
- New face kind `trim`: a NURBS surface bounded by loops of pieces. Border pieces are exact sub-curves of the surface border (knot insertion, `cSplit`/`cSub`); contour pieces are traced to 1e-13 on the surface and the cutting plane and interpolated by a cubic spline in 3D and in (u, v). Mass properties integrate the trimmed region with Green's theorem; the mesher triangulates the (u, v) polygon with interior Steiner points; STEP writes trimmed `ADVANCED_FACE` bounds with edges shared by geometry; move, mirror and scale carry them.
- `K.nurbs.planeCut(solid, p, n)`: keep `n.(x-p) <= 0` of ANY freeform solid (extrusion, loft, sweep, revolve, torus, sphere ...), the plane may leave through the sides. Faces are trimmed, planar faces are clipped, a cap face (with holes and several loops) is built from the section. Checked against analytic volumes (sphere cap, loft frustum, torus) and OpenCascade booleans and STEP read-back.
- Chained cuts: a result remembers its source solid and planes (`src`), a further plane recomputes from them, with exact kink points where two planes meet on a surface. Survives move/mirror.
- `cutPlanarTool` (convex flat tool of which one face reaches the solid) uses it for every freeform solid, so `K.cut` and the hybrid subtract are exact there.
- `toolCut`: a convex flat-faced tool of which SEVERAL faces reach the solid (box corner, slot): faces trimmed with the union of the tool's outsides (kinks located exactly), flat faces cut with the tool boundary inside them, one cap per tool face limited by the other tool planes. Checked against OpenCascade booleans (1e-9) and STEP edge sharing.
- Closed surfaces (full revolve, closed section) are cut along their seam into two patches before trimming, so STEP readers get ordinary loops.
- Direct modelling, exact: `moveFace` (a cut face or a prism end face along its normal) and `deleteFace` (undo the cut a face belongs to), recomputed from the source solid.
- Freeform mesh density raised (error about 0.04% of volume on spheres), same density on trimmed and untrimmed faces.
- Still approximate / OpenCascade: cylinders and other curved tools, cylinders and other curved tools, freeform against freeform, general fillet/shell/offset on freeform bodies.

## 1.5.0 - approximate operations inside AakarKernel (no OpenCascade needed)
`src/88_meshops.js`, `K.meshops`: booleans with freeform (NURBS) solids, shell (closed or with opened faces), offset (grow / shrink) and fillets on general curved bodies.
Method: fine tessellation -> signed-distance grid (exact near the surface, vector sweeps outwards, ray parity for the sign) -> marching tetrahedra -> a real AakarKernel body (planar triangles).  Booleans with a freeform solid first try the exact intersection of the tessellations (sharp creases stay sharp) and fall back to the field method.
- **These results are approximate, and say so**: `K.meshops.isApprox(body)` returns the grid size used; the app logs "approximate (mesh-based, about x mm accuracy)". Accuracy is about one grid cell (default 1/96 of the model size, finer when the wall / radius needs it): measured 0.03 % (offset of a box), 0.3 % (shell), 0.05-0.3 % (freeform booleans).  A wall or radius the grid cannot resolve is refused with an error, never faked.
- Fillets: convex edges by a limited morphological opening, concave edges by a closing, inside a tube around the chosen edges.  Known limit: where the rounded edge ends at other sharp edges, those neighbours are rounded a little too (within about one radius of the end).  Off by default for edges AakarKernel rounds exactly; the Exact panel has "Approximate fillets where no exact one exists".
- Exact operations stay exact; OpenCascade (K.hybrid) is still preferred when present.

## 1.7.0 — slanted cylinders
- `cutSkewCylinder`: a cylinder of any axis (slanted too) through a freeform prism, entering and leaving through both flat ends with the mouths inside the end faces, is exact: elliptical holes in both end caps, wall ruled along the tool axis. Volume equals the closed form to 1e-15; OpenCascade reads the STEP to 1e-11. `pockets` entries may carry `end:'thru'` and `dir`.
- Still not exact in-kernel: cylinders whose wall meets a side face, blind slanted pockets, cone/sphere/torus tools, freeform-against-freeform, fillet/shell/offset on freeform bodies, direct modelling on other freeform faces.

## 1.8.0 — curved tools (sphere, cylinder, cone, torus; slanted too)
- Trimming accepts curved constraints (`{val, grad}` next to planes): contour tracing, kink points and Newton projection are generic.
- `cutQuadricTool`: the solid's curved sides are trimmed by the tool, and the tool's own wall becomes a trimmed NURBS face whose region comes from the traced intersection curves (loops that wind around the tool are cut at the wall's seam; the solid's contour edges are split at the same points). Volumes agree with OpenCascade booleans to 1e-9 (sphere, slanted cylinder, cone, torus; cylinder through the side of a freeform prism).
- Flat ends of the solid are clipped by the tool (section curves of the plane with the tool, closed with the solid's edges); a tool end inside the solid gets a flat floor closed by the wall's own border circle (blind pockets, slanted too); wall regions that contain a pole (a bowl deeper than a hemisphere) are strips between loops and the wall's ends; several curved tools are cut together from the original solid (`qsrc`), so a second curved cut works.
- Limits (null → OpenCascade / approximate path): tools that overlap each other inside the solid (needs surface–surface intersection), a floor that meets the solid's boundary, tool ends touching the surface of the solid, torus walls that wind around the tube, curved cuts after a plane cut or a moved body.
- OpenCascade's own volume integrator is imprecise on trimmed B-splines (1e-5 level); fine meshes of the exported STEP converge to the kernel values.
