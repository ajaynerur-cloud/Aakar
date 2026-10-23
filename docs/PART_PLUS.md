# Aakar 8.7 – Part+ (advanced solid modelling)

A new **Part+** ribbon tab. Everything is a normal history feature: double-click to edit, suppress, roll back, undo, and it is saved in the `.aakar.json` file. Each group has worked examples under **Examples** (Housing, Frame, Screw & spring).

## Shape
| Tool | What it does |
|---|---|
| **Draft** | Sets faces to an exact draft angle about a neutral plane. Choose all vertical faces, outer faces, inner (cavity) faces, or the faces you selected; one-way or two-way. On a hollow part draft the outer faces (cavity half pulls one way) and the inner faces (core pulls the other way) as two steps so the walls stay parallel |
| **Rib** | Web from an open sketch line. It points toward the material and fills up to the part outline; one-sided, both-sided or a fixed distance |
| **Fillet+** | Variable-radius round or chamfer along an edge: start / end / optional middle radius, smooth or linear, plus a **setback** (run-out) so the round fades before a corner |
| **Wrap** | Emboss or engrave a closed sketch on a flat face, or wrap it around a cylinder (outside of a shaft or inside of a hole) |

## Threads & coils
| Tool | What it does |
|---|---|
| **Thread** | ISO metric M3 – M24 on a selected shaft or hole. **Cosmetic** (symbol only, instant) or **modelled** (true helical groove, a few seconds for ~10 turns). Right / left hand, full or partial length |
| **Helix** | Guide curve (radius, pitch, turns, taper, hand). Usable as a pattern path |
| **Coil** | Spring solid, round / square / flat wire, optional radius taper |

## Mould
| Tool | What it does |
|---|---|
| **Split** | Splits a solid with an axis plane or the plane of a selected face; keep both halves (optionally pulled apart) or one |
| **Core & cavity** | Mould block around the part, with a shrinkage allowance, subtracted and split at the parting plane into cavity and core halves; open-mould distance |

## Patterns
| Tool | What it does |
|---|---|
| **Along curve** | Repeat a solid along a sketch curve or a helix, count or spacing, turning with the path (Frenet frame) or keeping its orientation; separate components or merged |
| **Mirror features** | Mirror chosen features (holes, bosses, cuts, new bodies…) across a plane. The change each feature made is copied to the other side |

## Check
| Tool | What it does |
|---|---|
| **Draft analysis** | Colour map: good, insufficient, undercut, facing the pull direction, facing away. Required angle, pull direction, two-way, core/cavity mode. Analyses the selected solid |
| **Wall thickness** | Ray-cast thickness map with a minimum limit, histogram, thinnest spot. Samples where a ray cannot measure across a wall (such as the rim of a thin wall) are shown grey |

## Weldment
Every line of a sketch becomes a structural member: square / rectangular / round tube, angle, channel, I-beam, flat bar, round bar (sharp-cornered ISO / EN sizes). Corners are mitred or butt. The **cut list** gives profile, stock length, quantity and mass per row and exports CSV. Members are separate components, so they also appear in the Assembly BOM.

## Configure
**Configurations** is a design table: parameters (for example `W`, `H`, `Dia`) × configurations (Small / Medium / Large). Switching rebuilds the part; tick features to suppress them in a configuration. Import / export CSV. When a part with several configurations is inserted into an assembly you choose which one, and the BOM lists each size separately.

## Known limits
- Setback is a run-out at the ends of an edge; blending three fillets that meet at one vertex is not included.
- Solids are faceted, so curved faces are polygon approximations (as in the rest of Aakar). Modelled threads add many facets.
- Wrap uses sketch outlines (no text). Rib fills up to the convex outline of the part section.
- Feature mirror copies the material added / removed by a feature; mirrored features come from earlier steps only.
- Weldment profiles have sharp corners (no root radii); only consecutive lines are mitred.
