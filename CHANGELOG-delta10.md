# delta10 (contains the whole `kernel/` folder, because 75_step, 80_facade, 84_nurbs, sync.js, build.js and a new 92_stepfree.js changed together)

## Free-form STEP
- **New `kernel/src/92_stepfree.js`**: STEP bodies whose faces are B_SPLINE_SURFACE (rational or not, with knots or uniform / quasi-uniform / Bezier) are read as exact free-form solids. Planes, B-spline patches and cylinders can be mixed. Edge curves (line, circle, B-spline) are projected onto their patch (Newton) and become the trimmed boundary. Closed patches (tubes): the seam is moved in the gap (exact knot insertion), faces bounded by two circles are joined into one loop, full cylinder walls read with or without a seam edge.
- **Editing imported free-form bodies** (push/pull a flat face): outward = exact side walls swept from the face edges; inward = exact plane cut (needs the face to be an end face: the rest of the body behind it, and whole B-spline patches).
- In the app, a file whose solids are all free-form builds its faceted body from the exact kernel read (the generic B-spline tessellation gave a wrong volume on closed patches: 5516 instead of 9937 on the test vase), so push/pull on its flat faces stays exact (recipe `moveFace`).
- Not read yet (clear error message): spheres, cones, tori, revolved/extruded surfaces next to free-form faces; B-spline faces that are closed in v; seam handling for more than two ring loops; deleting a face of an imported body.
- STEP writer (84_nurbs): closed edges (full circles) shared by two faces now keep their direction (it was lost because start = end), so exported solids with holes re-import correctly.
- `75_step.js`: `stepRead(text, {tolerant})`, `AK.stepParse`; `80_facade.js`: tolerant read when free-form bodies are mixed with analytic ones. `sync.js` and `build.js` know the new extension. New suite `test/16_stepfree.js` (18 tests), added to `run-all.js`.

## Sketch
- **Face-edge reference lines**: arcs tessellated into only 2 pieces now become arcs (end turns = half the middle turn). Uneven pieces were already handled in delta9.
- **Offset**: outside corners are now rounded with radius = offset distance (arc centred on the original corner, coincident with it) instead of a sharp mitre. Inside corners still trim. Applies to chains of lines and arcs (free-form chains unchanged).

## Still needs your sketch file
- the "has no closed profile" message on a closed-looking sketch, and the extra filled face when extruding (probably the kept original inside an offset outline: the Extrude dialog lists both regions).
