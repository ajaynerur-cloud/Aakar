// score() copied verbatim from the 8.15.1 file (Ctrl+K command palette); the command list is what harvest() builds
// (label = button text, title = tooltip, group = group label, tab = the tab it was found on)
const TABNAME = { subdx: 'SubD+', nurbsx: 'NURBS+', partx: 'Part+', part: 'Part', assembly: 'Assembly', sheet: 'Sheet metal', model: 'Model', surface: 'NURBS', subd: 'SubD', bim: 'BIM', analysis: 'Analysis', drawing: 'Drawing', render: 'Render', cam: 'CAM', learn: 'Tutorials' };
function score(c, q) {
  if (!q) return 1; const t = (c.label + ' ' + c.title + ' ' + c.group + ' ' + (TABNAME[c.tab] || '')).toLowerCase(), L = c.label.toLowerCase();
  if (L === q) return 100; if (L.startsWith(q)) return 80; if (L.includes(q)) return 60; if (t.includes(q)) return 40;
  let i = 0; for (const ch of t) if (ch === q[i]) i++; return i === q.length ? 15 : 0;
}
const C = [
  ['CAM', '3-axis CAM: facing, roughing, profiling, drilling, simulation with gouge check, G-code (ISO / LinuxCNC / GRBL)', 'CAM', 'cam'],
  ['Features', 'Recognize holes (through / blind / counterbore), bosses, fillets, pockets and hole patterns. The Z-axis holes are what CAM › Auto program drills.', 'Recognize', 'cam'],
  ['Measure', 'Measure distances on the model (hole spacing, depths, stock size)', 'Inspect', 'cam'],
  ['Section', 'Cut the model with a plane to check pocket and wall depths before machining', 'Inspect', 'cam'],
  ['Examples', 'Examples & tutorials: faceted vase, lattice egg vase, gears, flange spool, truss FEA, spring, fan rotor', 'Learn', 'learn'],
  ['Handbook', 'Download the printable tutorial handbook', 'Learn', 'learn'],
  ['Import tutorial', 'Import Aakar tutorial packs (.json or .zip)', 'Tutorials', 'learn'],
  ['Library', 'Open the tutorial library: pictures, ▶ Build and step-by-step', 'Tutorials', 'learn'],
  ['Cam', 'Cam and follower: the follower lifts by the motion law as the cam turns', 'Mates +', 'assembly'],
  ['Hole wizard', 'Holes', 'Hole & library', 'part'], ['Extrude', 'Extrude a sketch', 'Create', 'model'], ['Fillet', 'Round edges', 'Modify', 'model']
].map(([label, title, group, tab]) => ({ label, title, group, tab }));
for (const q of ['cam', 'tutorial', 'library', 'drill', 'g-code', 'handbook']) {
  const r = C.map(c => [c, score(c, q)]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c, s]) => `${c.label} (${TABNAME[c.tab]} › ${c.group}, ${s})`);
  console.log(JSON.stringify(q).padEnd(11), '->', r.join('  |  '));
}
