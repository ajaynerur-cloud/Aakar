# Aakar 8.13.0

Built on 8.12.2. Single-file app (index.html), works offline.

## Foundation
- Persistent topological naming: every face / edge of every solid carries a stable name; fillets, holes, shells, sketches on faces, mates and drawing annotations reconnect by name after an upstream edit (falls back to the old geometric matcher; older files are upgraded on open).

## Assembly
- New mates: Lock, Hinge, Slider, Ball, Screw, Rack & pinion, Cam & follower (motion laws), with limits.
- Motion study: drivers, play / loop / ping-pong, stop-at-collision, path plot + CSV, WebM video.
- Fast BVH collision engine, Drag tool (stops at collisions), collision check.
- Exploded view in steps (auto-built from mates, trails, video), BOM balloons in 3D, assembly drawing with BOM table + balloons.

## Part
- Variable-radius fillet (any number of control points, auto-repair ladder), Face blend, Full round, Setback corner.
- Design table 2.0: columns from any dimension, derived rows, paste / CSV, size series, comparison, per-component configuration in assemblies.

## Drawings
- GD&T frames (14 characteristics, modifiers, datums), datum symbols, surface finish, weld symbols, tolerance dimensions, ISO / ASME, mm / inch; anchored to model edges, red when the edge is lost. SVG / DXF / print.

## AakarKernel 1.1
- clash(), clashMatrix(): exact-mesh interference test.
