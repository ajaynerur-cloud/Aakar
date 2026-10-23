# Aakar 8.10

## 1. Trimmed NURBS surfaces in STEP, with their trim loops
Trimmed surfaces used to be written as the complete surface. Now each becomes proper STEP faces: outer and hole bounds of edges whose 3D
curve comes with a `PCURVE` on the exact surface. Seams of revolved surfaces are one `SEAM_CURVE` with both PCURVEs; a pole is left as a
single vertex; a trim across the seam becomes faces sharing the seam edge. Reading the file back restores the trim.
**Verified:** an independent checker (Python, no Aakar code) found no problems on a plate with a hole and three trimmed domes (around the
axis, off axis, across the seam): every edge curve lies on its surface (worst 1·10⁻⁴ mm), loops close, seam edges are used twice in
opposite directions. Export → import gives back the trimmed area exactly (to 0.1 mm²).
*Limit:* files are large (100–450 kB per trimmed dome face) because edges are dense polylines; the untrimmed-surface path is unchanged.

## 2. Background work with progress
Booleans (including the modelled thread), SubD → solid, quad remesh, SubD → NURBS and image trace run in Web Workers when they would take
more than ~0.3 s: the screen stays usable, a **Background work** panel shows each job, an estimated progress bar and Cancel; later steps
wait. Results are cached, editing a running step cancels the stale job, and results equal the inline ones. Switch off in the Workspace menu.
*Limit:* progress is an estimate.

## 3. Persistent names
SubD points carry stable ids, and SubD steps store their points / edges / faces by id. Verified with three cases where an earlier step
changes the cage (a loop that splits a creased edge, a bevel that renumbers points, a deleted face that shifts face numbers): with names
all three keep the right target; without them all three went wrong. Missing elements are reported on the step. Old files upgrade on
first open. Solid face / edge references also remember their position relative to the part's box, so they survive resizes, and weak or
ambiguous matches show a warning.

## 4. Sketch+ (Model tab, also on Part+, NURBS+ and SubD+)
* **3D sketch** — polylines / splines in space: click on a work plane through the last point (X / Y / Z keys) or on a face, snap to
  vertices, type coordinates, edit in a table. Drives weldments (straight lines; splines are skipped with a note), curve patterns and the
  NURBS+ tools. *Tested by real clicks: every point landed exactly on the intended coordinate.*
* **Project edges** — selected solid edges or a curve onto a new or existing sketch plane, straight or along a direction; the facets of a
  round edge become one true circle; stays linked to the solid. *A Ø10 hole and a Ø30 rim came back as exact circles.*
* **Image trace** — load a picture, set its real width; outlines, holes, circles and sharp corners at sub-pixel accuracy (a rectangle comes
  back with exactly 4 corners, a triangle with 3); runs in a worker. *Circle radii within 0.1 %, positions within 0.01 mm.*

## 5. Optional exact kernel (OpenCascade)
See `occt/README.md`. The app works the same without it. The layer around the kernel is tested; **the real kernel's first run is the GitHub
workflow**, which only packages it if its 13-check self-test passes.
