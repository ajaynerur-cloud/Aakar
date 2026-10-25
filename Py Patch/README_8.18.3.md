# Aakar 8.18.3 (from 8.18.2)

## 1. Dimension entry box was stretched across the whole sketch   [FIXED]
Cause: a global style `input[type=text]{width:100%}` (specificity 0,1,1) beat the box's own `.sk-val{width:90px}` (0,1,0).
It was already in 8.18.0. Measured before: 970 / 970 / 1500 / 1200 px wide (Classic / Studio / Graphite / Pro). Now 90 px in all four.

## 2. Typing in Search while sketching lost letters   [FIXED]
Cause: the sketcher's window-level key handler took every key (C = circle, S = select, T = tangent, L = line, X = construction...),
and Enter = Finish sketch, Backspace = delete, even while you were typing in the Search box. Typing "construction line" gave "onuion in".
Now keys typed in ANY text box (Search, dimension boxes, panel) belong to the box.
Also new: while sketching, Search lists the sketch commands first (Line, Rectangle, Circle, Construction line (toggle), Smart dimension,
Auto-dimension, Points & dimensions table, Delete, Finish sketch ...). "construction line" finds the Construction line command.

## 3. Push / pull symbol when extruding   [ADDED]
* After the Extrude tool, Instant3D now switches on by itself with the new feature selected: a green double-headed arrow grip on the model,
  the chip "PUSH / PULL  Distance 10 mm" (click to type a value, or drag the grip; Shift = no snap). The bar says what to do. X switches it off.
* Press-pull mode (select a face, Extrude toggle or E): the arrow now carries a green "PULL + adds material" badge at its tip and a
  red "PUSH - removes material" badge on the other side. Dragging shows the live distance and creates the push/pull feature, as before.
Note: while Instant3D is on, the Move/rotate gizmo is hidden (existing behaviour): switch Instant3D off with its X.

## 4. Selected objects are clearly marked   [FIXED]
3D: a selected whole body now has a thick orange outline and a banner ("Selected: Box A - Delete removes the whole body - Esc deselects").
Delete on a face first turns it into the whole body: that body is then RED (thick red outline, red tint) with the banner
"Delete 'Box A'? Press Delete again to remove it - Esc cancels". Second Delete removes it (Ctrl+Z restores it).
Sketch: a selected shape is drawn with a wide orange glow, its corner points turn orange, and double-click on a line or arc selects
the WHOLE connected shape (a rectangle = its 4 lines). Delete removes exactly that shape.

## Also
The Points & dimensions panel is narrower (336 px) and the sketch is moved left if the panel would cover it.

## Tested (real Chromium, software rendering)
value box width 90 px in 4 skins | Search while sketching 10/10 | 3D selection / red delete / Esc / second Delete / undo 10/10 |
press-pull badges + real drag 4/4 | Extrude -> Instant3D push/pull grip + real drag (10 -> 26 mm) 7/7 | sketch selection, double-click shape select,
panel placement 8/8 | earlier dimension-panel tests, 4 skins | Search lists 354 commands | Watch mode builds a tutorial | 8 built-in tutorials identical to 8.18.0.

## Not done / limits
* The Extrude DIALOG itself is still modal and dims the 3D view: the push/pull grip appears after you press OK, not inside the dialog.
* Software-rendered browser only; not tested on a real GPU or touch.
* "Complete object" was read as: a whole 3D body, and a whole sketch shape. If you meant something else (e.g. the feature tree), tell me.
