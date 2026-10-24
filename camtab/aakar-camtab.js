/* Aakar 8.15.1 · CAM tab companions
 * Puts the tools you reach for while programming a part next to the CAM button, so you do not have to leave the CAM tab:
 *   Recognize › Features  – lists holes / bosses / pockets / patterns (the Z-axis holes are what CAM › Auto program drills)
 *   Inspect   › Measure   – distance / hole spacing / depth on the model
 *   Inspect   › Section   – cut the model with a plane to check pocket and wall depths
 * They call exactly the same functions as the buttons on the Part / Model / Assembly tabs; nothing is duplicated.
 * Loads after the CAM module; safe to run twice. */
(function (G) {
  'use strict';
  const CAD = G.CAD, P = G.PRISM; if (!CAD || !P || !P.addGroup || P.__camTabCompanions) return; P.__camTabCompanions = true;
  const say = (m, bad) => { try { P.toast(m, !!bad); } catch (e) { /* ignore */ } };
  const ui = () => (CAD.x10 && CAD.x10.ui) || null;
  const SVG = {
    feat: '<circle cx="8" cy="9" r="3"/><rect x="13" y="5" width="7" height="7" rx="1"/><path d="M4 18h16"/>',
    meas: '<path d="M3 17L17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>',
    sec: '<rect x="4" y="5" width="16" height="14" rx="1"/><path d="M2 12h20" stroke-dasharray="3 2"/>'
  };
  // Recognize
  P.addGroup('cam', 'Recognize', [['camfeat', 'Features', () => {
    if (CAD.fr && CAD.fr.open) CAD.fr.open(); else say('Feature recognition is not available in this build', true);
  }, 'Recognize holes (through / blind / counterbore), bosses, fillets, pockets and hole patterns. The Z-axis holes are what CAM › Auto program drills.', SVG.feat]]);
  // Inspect
  P.addGroup('cam', 'Inspect', [
    ['cammeas', 'Measure', () => {
      const u = ui(); if (!u || !u.measPanel) return say('Measure is not available in this build', true);
      try { u.measPanel(); if (u.startMeasure) u.startMeasure('dist'); } catch (e) { say('Measure: ' + e.message, true); }
    }, 'Measure distances on the model (hole spacing, depths, stock size)', SVG.meas],
    ['camsec', 'Section', () => {
      const u = ui(); if (!u || !u.secPanel) return say('Section is not available in this build', true);
      try { u.secPanel(); } catch (e) { say('Section: ' + e.message, true); }
    }, 'Cut the model with a plane to check pocket and wall depths before machining', SVG.sec]
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
