# delta9 (app only, kernel unchanged from delta8)
Sketch
- **Face edges reference**: tessellated arcs whose points are not evenly spaced (the shorter pieces a kernel puts at the ends of a fillet) are now recognised as one arc instead of many tiny lines. Regular polygons and long chords still stay straight.
- **Split lines at crossings** (sketch menu) now works on every curve: a line crossing a circle cuts the circle into arcs, arcs and splines are cut too, in one undo step. Before, only line-against-line crossings counted, hence "No lines cross each other here".
Known limits
- An arc that was tessellated into only 2 pieces per quarter still shows as straight lines (too few points to tell it from a polygon).
- Free-form STEP import/editing is not built yet.
