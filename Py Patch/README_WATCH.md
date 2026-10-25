# Aakar 8.18.0 · Tutorial Watch mode

What it does: before each tutorial step is built, Watch shows it.
1. The ribbon tab and the exact toolbar button: a cursor moves there, a ring pulses, a caption names the tool and its path.
2. For sketches: a card with the plane, a grid and axes; points appear one by one (numbered, with coordinates) and the curve grows; then the Finish button is pressed.
3. For features, edits, SubD operations, fillets, holes, shells and global parameters: a dialog card with the real field labels; each value fills in one at a time. Edits show the old value struck through next to the new one.
4. Then the Tutorial Studio builds the real step exactly as before. The model is identical with Watch on or off.

Everything is derived from each step's own `build` recipe, so all tutorials (built-in and imported) get it with no rewriting.

Controls (strip under the tutorial player): **Watch** on/off · **Watch pace** Slow / Normal / Fast · **cursor** on/off.
Skip the current animation: the **Skip animation** button or **Esc**. Pause or close the player: it stops.
Settings are remembered in the browser.

Where to find it: Tutorials › Library › ▶ Build (plays every step) or Step by step › ▶ Build this step.

## Files
* `index.html` / `Aakar_8.18.0.html`   the app (8.17.2 + Watch; version label 8.18.0)
* `aakar-tutorial-watch.js`            the module (readable source)
* `apply_watch.py`                     adds Watch to any 8.17.x file that has the Tutorial Studio:  `python apply_watch.py index.html`
* `wall.py`, `wtest1.py`               the tests (need Python + Playwright + Chromium; edit the chromium path)

## Tested (software-rendered Chromium, Classic skin unless noted)
* All 38 built-in tutorials built through the real player with Watch ON, then headless with Watch OFF:
  38 / 38 built fully, no errors, identical feature / body / item counts and volume.
* Skins Studio, Graphite and Pro: tool button found and pointed at on every step, no errors.
* Parameter steps (param / link): built correctly (W = 90 gives 15 flutes at scale 1.5).
* Screenshots checked by eye: tool ring, tab hop, sketch drawing, dialog filling, edit old -> new, SubD dialog.

## Limits
* The sketch card is a schematic of the sketch, not drawn on the 3D view (the 3D camera is not projected).
* The animation shows what Aakar will build; the cursor does not click the real buttons.
* "Guided" mode (waits for the learner's real click) is not built.
* Not tested on a real GPU, or on touch devices.
