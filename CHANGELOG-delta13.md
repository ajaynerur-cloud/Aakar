# Delta 13 (cumulative build — includes deltas 1–12)

## Name this part (pop-up)
- Skippable pop-up for every creation: sketch (asked when the plane is picked), surface, NURBS, SubD, direct modelling/primitives.
- Name carries over when a sketch/surface/NURBS/SubD becomes a solid; asked again when a body is split into a separate component/entity.
- Never asked for join / cut / fillet / move / mate. Optional folder + material. "Don't ask again" + Preferences.

## Parts tab (Part Organiser)
- Sort: creation order, name (natural A→Z / Z→A), size, position X/Y/Z, distance, material, colour, last edited, component, manual.
- Group by, search, filters, folders, tags, pin, lock, bulk bar, find in 3D, clean-up, auto-organise, rename many, group totals.
- Stored in the document meta (saved with the file).

## Features list tick boxes
- Multi-select with bulk: suppress, unsuppress, hide, group into folder, colour, tag, rename prefix, roll back, copy, delete (with dependency warning).

## Known limits
- Lock is a soft lock (bulk actions skip it, rename blocked).
- Dependency detection covers id references only (not implicit same-body cuts).
- Pop-up skipped for face sketches, imports/inserted parts, and >12 parts created at once.
- Hover highlight only for bodies; ticking a feature also ticks its source sketch.
- Auto-organise groups by kind/name prefix, not true assemblies. Mass only for materials in the density table.
- Not tested on Windows.

## Fix (same delta)
- Name, folder and material from the pop-up now carry over when the solid is made with the Pull tool (it commits quietly and was skipped before).
- "+ Folder" with nothing ticked now moves the part selected in 3D into the new folder.
