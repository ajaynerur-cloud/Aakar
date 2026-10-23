# AakarKernel 1.0

An exact-surface boundary-representation (B-rep) kernel for Aakar, written in plain JavaScript. It is **built into the single HTML file**: it needs no
WebAssembly, no download and no network. It plugs into Aakar's *optional exact kernel* framework (`CAD.exact`), so it provides exact booleans, exact
measurement and exact STEP export to the rest of the app, and falls back to Aakar's faceted kernel whenever anything fails.

## What it is (and is not)

| | |
|---|---|
| **Geometry** | exact analytic surfaces: plane, cylinder, cone, sphere, torus; edge curves: line, circle, general curve (dense poly lying on both surfaces) |
| **Topology** | `Body → Face → Loop → Coedge → Edge → Vertex`; validation checks that every edge is used exactly twice, once per direction, and that loops close |
| **Primitives** | box, cylinder, cone / frustum, sphere, torus; rigid + uniform-scale transforms |
| **Booleans** | union, subtract, intersect of any of those, nested to any depth |
| **Measurement** | volume, area, centroid, inertia tensor by **Green's theorem on the true surfaces** (not on the mesh) |
| **STEP** | AP214 writer (`PLANE`, `CYLINDRICAL_SURFACE`, `CONICAL_SURFACE`, `SPHERICAL_SURFACE`, `TOROIDAL_SURFACE`, `LINE`, `CIRCLE`, B-spline edges) and a reader for the same subset |
| **Not (yet)** | fillet / chamfer / shell / draft / offset, NURBS surfaces, extrude / revolve of sketches as exact bodies, meshing of imported STEP bodies |

It is not Parasolid. Parasolid is a commercial kernel with decades of work; AakarKernel is a small, tested exact kernel that covers the analytic part
of that job and is designed to grow.

## How a boolean works

1. Each operand is tessellated **conformingly**, and every triangle carries the exact B-rep face it came from.
2. A BSP boolean runs on the triangles (robust, tolerance-based).
3. The result is welded and T-junction-healed, polygons are regrouped by the **exact surface** they belong to, and faces on the same surface are merged.
4. Every vertex is projected onto the true surfaces that meet there (Gauss-Newton), boundary loops become edges, and each edge is recognised as a
   **line**, a **circle** (to 5·10⁻⁹ of the model size) or a dense curve that lies exactly on both surfaces.
5. Guards compare exact and faceted volume; if anything disagrees the kernel throws and Aakar uses its faceted boolean instead.

So the *surfaces* are exact, lines and circles are exact, and general intersection curves are accurate to about 10⁻⁷ of the model size.

## Files

```
kernel/src/*.js        numbered source parts (math, surfaces, topology, mass properties, primitives, BSP, reconstruction, kernel, STEP, facade, wiring)
kernel/build.js        concatenates the parts into kernel/dist/aakar-kernel.js
kernel/embed.js        embeds the kernel into an Aakar html file and wires it in:   node kernel/embed.js in.html out.html 8.11.0
kernel/test/*.js       tests (node kernel/test/run-all.js)
```

## API (what `CAD.exact.kernel` exposes)

```js
const k = AakarKernel.kernel;
const plate = k.cut(k.box(40,40,10), k.translate(k.cylinder(5,30), [20,20,-10]));
k.volume(plate); k.area(plate); k.massProps(plate);        // exact
k.validate(plate); k.info(plate);                            // topology report
k.mesh(plate, 0.05);                                         // {positions, indices, faces}
k.stepExport(plate);                                         // AP214 text
k.stepImport(text);                                          // exact body (measure / validate / re-export)
```

## Known limits

* Trimmed torus faces are integrated on their facets (error ≈ 10⁻³); everything else is integrated exactly.
* Near-tangent or touching operands can fail the guards; Aakar then falls back to its faceted boolean.
* STEP: periodic faces are written without seam edges (legal in AP214; OpenCascade-based readers heal them). Not yet verified in SolidWorks / NX.
* Only bodies built from primitives and booleans take part (that is what the recipe framework of Aakar 8.10 can describe).

## Tests

`node kernel/test/run-all.js [aakar.html]` runs: closed-form mass properties of every primitive, 40 boolean cases against closed-form volumes, STEP round
trips, 116 sphere/sphere cases against the lens formula, the **shipped 8.10 exact-kernel code** driven with AakarKernel, and the wired HTML end to end.
`node kernel/test/fuzz.js <seed> <n>` runs random primitives and booleans against a Monte-Carlo check.
