Headless regression tests (Playwright + Chromium). Edit EXE in common.py to point at your Chromium, and run from the package folder.
 - *.js tests run through run_js.py:   python tests/run_js.py index.html tests/test_w2_curves.js
 - *.py tests drive the real UI (clicks, drags, keys):  python tests/test_gumball_mouse.py  (each takes 30-60 s)
 - Booleans run in a background kernel: the dome / dimple / fillet tests wait for "Computing in the background…" to clear.
 - The sketch tests place the view at fixed coordinates; clicks that land off the canvas do nothing.
