# delta7
Lessons
- Tutorial guide: **◀ Back now restarts the previous step** (what you made from that step on is undone). New **Restart step** button on the current step.
- The guide **recognises work you already did by hand** (features, face selected) and opens the lesson at the first step that is still missing ("Picked up where you left off").
- "Do it for me" now runs the delete-hole step, the fillet lesson's round step, and the Face to NURBS step (the last one did nothing before).
- New tutorial files `app/Aakar_Direct_Tutorials.json` (5 lessons) and `app/Aakar_Cross_Tutorials.json` (4 lessons) so the repo holds them like the Sketch aids pack.
Direct editing
- Fillet radius now works at any angle between two flat faces (tested at 123.7°), not only 90°.
- Sloped-neighbour push/pull works on faces with holes and on several outlines (round holes and sloped square holes tested, both directions).
- Offset face keeps relationships: all flat faces facing the same way (parallel), the opposite pair, or all faces on the same axis (concentric).
Face to NURBS
- Cylinder faces made of mesh facets are now closed full circles (a gap of one facet was left before, 3 % too little area); partial cylinders such as fillets use the kernel's exact axis. Checked: hole wall 603.16 mm² (exact 603.19), R3 fillet 282.743 mm² (exact 282.743).
Kernel 1.5: tests 58 of 58 in 14_direct.js; all suites pass.
