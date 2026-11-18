# delta8
CI fix
- `kernel/test/run-all.js` now preloads `kernel/test/_window.js`, so the tests also run when an older kernel build asks for `window` (the "window is not defined" failures on Node 20). This delta ships the whole `kernel/` folder (src, dist, tests, build.js, sync.js) so the files match each other.
Exact rounds
- Fillets and chamfers between two flat faces now work at **any angle**, exactly (before: only 90 degrees). Fillet = flat cut at the tangent points plus the round segment; tested at 123.7 degrees (volume exact to 1e-11), the radius can be changed afterwards.
- Any exact round can be **removed or resized wherever it sits in the history**, including rim rounds (torus) - not only the last step. It refuses with a reason if a later step addresses faces by number.
Direct editing
- Tilt face keeps **sloped side walls on their own planes** (the walls carry on instead of following the outline straight up). Single-outline faces with flat walls; faces with holes or curved walls behave as before.
- SubD > To solid: new option "give back the original solid if the cage was never edited" (exact holes and fillets). Off by default.
Sketch profiles
- Gaps up to 1e-5 of the sketch size are now closed (was 1e-7), and an end that lies on another curve (T-junction) closes the outline there.
- "has no closed profile" now says where the loose ends are and how far apart they are.
Not built (see notes in the reply)
- Free-form STEP editing, a SubD copy that is identical to a NURBS surface.
