# delta11 (app only: replace app/index.html)

Roller + bolt + helix workflow
- Helix / Coil: select the bolt's round face (shaft, hole wall or round end) first; the axis, centre, radius and turns are taken from it. Nothing selected = old defaults (origin).
- New white "Move" handle on Helix, Coil and Thread-from-sketch (standard axis). While it is on screen the model shows MATCH POINTS: cyan = circle centre, pink = mid-height centre, white = body centre, green = face centre, yellow = corner. Dragging the handle snaps to them (name shown while dragging).
- New "Pick in 3D" row in those dialogs: Round face / Move axis to a point / Solid (the modal hides while you click).
- Thread from sketch, Solid = Automatic now joins/cuts ONE solid (the one holding the tooth, else the most overlapped) instead of every solid whose box it touched. New option "Every solid it touches" keeps the old behaviour.
- New command Make > Combine group > "Separate solids": a body made of unconnected pieces becomes one solid per piece, either as separate COMPONENTS (own part: move, mate, BOM) or independent bodies of one part.
- Two sketches extruded as "New body" are separate components already.

Tests: regs 13/13 clean; scripted roller+bolt tests (seed, snap drag to roller top centre, auto target, separate solids).
