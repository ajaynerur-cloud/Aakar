/* ======================================================================
 * Aakar 8.17 · SURFACE TOOLS  (part B: toolbar group)
 * ====================================================================== */
(function (G) {
  'use strict';
  const CAD = G.CAD, P = G.PRISM, RG = CAD && CAD.ref;
  if (!RG || !RG.surf || !P || !P.addGroup) return;
  const IC = {
    planar: '<path d="M3.5 17.5l4-9h13l-4 9z"/><path d="M7.5 8.5l-4 9M20.5 8.5l-4 9" opacity=".35"/>',
    trim: '<path d="M3 15l7-8 11 4-7 8z"/><path d="M12 3v7M12 14v7" /><path d="M7 11l10 3" stroke-dasharray="2.5 2"/>',
    mid: '<path d="M3 6h18M3 18h18"/><path d="M3 12h18" stroke-dasharray="3 2.5"/>',
    rad: '<circle cx="12" cy="12" r="2.6"/><path d="M12 3.5v3.4M12 17.1v3.4M3.5 12h3.4M17.1 12h3.4M6 6l2.4 2.4M15.6 15.6L18 18M18 6l-2.4 2.4M8.4 15.6L6 18"/>',
    knit: '<path d="M3.5 8h7.5v8H3.5zM13 8h7.5v8H13z"/><path d="M9 12h6"/><path d="M11 6v2M13 6v2M11 16v2M13 16v2" opacity=".6"/>'
  };
  const open = (type, mode) => () => { try { RG.openPanel(type, mode ? { mode } : {}); } catch (e) { P.toast && P.toast(e.message || String(e), true); } };
  const items = [
    ['srfPlanarBtn', 'Planar', open('srfPlanar'), 'Planar surface: a flat surface from a closed sketch or the edges of an outline (inner loops become holes)', IC.planar],
    ['srfTrimBtn', 'Trim by surface', open('srfTrimSrf'), 'Trim one surface with another surface, plane or face, or trim both (mutual trim); optional extend-to-meet', IC.trim],
    ['srfMidBtn', 'Mid-surface', open('srfMid'), 'Mid-surface between two faces or surfaces', IC.mid],
    ['srfRadBtn', 'Radiate', open('srfRadiate'), 'Radiate a surface outward from curves or edges: in a plane, along a direction or from an axis, with a draft angle', IC.rad],
    ['srfKnitBtn', 'Knit', open('srfKnit'), 'Knit surfaces (trimmed ones too) into a shell, and into a solid when closed', IC.knit]
  ];
  ['surface', 'nurbsx'].forEach((tab) => P.addGroup(tab, 'Surface tools', items, 'Reference'));
})(window);
