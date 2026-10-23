# Aakar 8.8 – NURBS+ (advanced surfacing) · G3 added in 8.12

A new **NURBS+** ribbon tab. Every tool is a normal history feature (double-click to edit, suppress, roll back, undo) and is saved in the `.aakar.json` file. The **Examples** group opens four finished models: *Class-A blend*, *Trimmed dome*, *Network & fill*, *Scan fit*.

New object types in the feature / body list: **Curve** (a NURBS curve item) and **Points** (an imported point cloud). Surfaces can now carry a **trim**.

## Trim
| Tool | What it does |
|---|---|
| **Project** | Projects a sketch or curve onto a surface (closest point, along the sketch normal, or along ±X/Y/Z) and creates a *curve on surface* item. The curve lies exactly on the surface and can be used as a trim boundary |
| **Trim** | True trimming. The surface stays an exact NURBS surface; the trim is stored as loops in its (u,v) parameters. Closed loops keep *inside* or *outside* (cut-outs), loops that encircle a pole or straddle the seam of a periodic surface work, an open curve that runs edge to edge splits the surface (keep left / right). Trims stack; area, display, Thicken and Offset honour them |
| **Untrim** | Removes all trims, only the last one, or only the cut-outs / only the outer trims |

## Continuity
| Tool | What it does |
|---|---|
| **Blend** | A new surface between two edges with **G0 / G1 / G2 / G3** at each side and a tangent strength; quintic Hermite cross sections (degree 7 for G3) interpolated along the edge |
| **Match** | Moves the first control rows of a (non-rational) surface so it meets another surface with G0 / G1 / G2 / G3; G2 needs ≥ 4 rows across the edge, G3 ≥ 5 rows and degree ≥ 3 |
| **Check** | Live readout for any join: gap, tangent angle, curvature difference and curvature-rate difference (G3) with sparklines and a verdict (G0 / G1 / G2 / G3). The join edges are drawn red (gap) / orange (G0) / yellow (G1) / green (G2) / blue (G3) |

## Analyse+
| Tool | What it does |
|---|---|
| **Comb** | Curvature comb on surface iso-lines (u and v) and on curves; reports the strongest curvature and tightest radius |
| **Zebra** | Zebra stripes (stripe count and direction). Stripes crossing a join without a kink = tangent continuity; stripes bending smoothly = curvature continuity |
| **Deviation** | Colour map and report (max, mean, RMS, % within tolerance, histogram) of the distance from a surface to another surface, a solid or a mesh |

## Fill
| Tool | What it does |
|---|---|
| **Network** | Gordon surface through a grid of crossing curves (each curve of direction 1 crosses each of direction 2). Interpolates every curve; the status reports how close the result stays |
| **N-sided** | Fills a closed loop of 3 or more sides with one patch per corner. Tangent control: none (G0, a minimal membrane), flat, or **from a surface** (G1). A sphere cap filled from the sphere's own tangents stays within about 1 % of the sphere |

## Edit
| Tool | What it does |
|---|---|
| **Extend** | Extends an edge straight (G1) or following the curvature (G2). *Merged* re-fits one longer surface (the original shape is kept to within 1e-12); *not merged* adds an exact strip |
| **Offset+** | Offset re-fitted until it is within the accuracy you set; trims carried across; warns when the offset is larger than the local radius of curvature (it folds) |
| **Sew** | Joins surfaces whose edges coincide (position match, either direction) into a watertight shell, and a solid when closed; open edges are counted |

## Curves and surfaces: rebuild, knots, degree
| Tool | What it does |
|---|---|
| **Curves** ▸ Rebuild / Add knot / Remove knot / Raise degree / Lower degree | Create a new curve item from a sketch or a curve item. Insert and raise-degree are exact (rational curves too); remove-knot only removes what stays within a tolerance; rebuild and lower-degree are least-squares fits that report the deviation |
| **Surface** ▸ Rebuild+ | Least-squares rebuild with a chosen control net and degree, edges held tightly; reports max / RMS deviation |
| **Surface** ▸ Add knot / Remove knot / Raise degree | Exact operations on the control net in u or v (rational surfaces too) |

## Reverse engineering
**Import points** reads XYZ / CSV / TXT / PTS / ASC, OBJ, PLY (ascii) and STL (ascii or binary). **Fit surface** fits a NURBS surface to a point cloud, a mesh or a solid (least squares, foot-point refinement) and reports RMS, maximum and the share of points within your tolerance; select the fitted surface to see the points coloured green / yellow / red.

## Known limits
- The fit and the surface directions work on sheets that can be seen as a height field over a plane (or along X / Y / Z); closed scans are not unwrapped. Up to 4000 points are used (the rest is thinned evenly); imports keep up to 12000.
- Trimmed surfaces are exported to STEP as the complete untrimmed surface (the status bar says so). **Solidify** refuses trimmed surfaces; use **Thicken**, or **Sew**.
- Match works on non-rational surfaces. G1 / G2 blends measure about 3 % curvature mismatch at G1 and 0 % at G2 on a cylinder test.

## G3 (8.12)
G3 means the *rate of change* of curvature across the join also agrees (no "curvature jump in slope"). Class-A surfaces such as car body panels use it.
- **What is compared.** The cross curves of the two surfaces at each point of the join must agree to 3rd order in arc length: r′ (G1), r″ (G2) and r‴ (G3).
- **Exact derivatives.** G3 uses exact NURBS derivatives (derivative control points and the rational quotient rule), not finite differences. A cylinder's r‴ matches −T/R² to 1e-17.
- **Blend G3.** A degree-7 Hermite cross section prescribes r′, r″ and r‴ at both ends. A G3 side next to a G2 or G1 side also works.
- **Match G3.** The 4th control row is solved from the 3rd u-derivative, keeping the surface's own tangential speed terms.
- **Tolerances.** The verdict is G3 when the curvature-rate difference is ≤ 15 %, measured relative to the larger r‴ with a floor of 0.05 / size².
- **Coplanar planes.** Two coplanar planes read G3, which is correct: they are G∞.
- **Tests.** `test/nurbs-g3.mjs` (run by `npm test`) checks the exact derivatives against finite differences on all four edges, the cylinder r‴, the degree-7 end conditions and the match row.
- Trim loops are polygons in parameter space; a very coarse sketch gives a coarse trim edge.
- Gordon networks need every curve to cross all the others once, in a consistent order.
- Sew works on untrimmed surfaces and produces a faceted shell, like every Aakar solid.
