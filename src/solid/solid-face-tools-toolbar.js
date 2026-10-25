/* Aakar 8.17 · SOLID FACE TOOLS (toolbar group) */
(function (G) {
  'use strict';
  const CAD = G.CAD, P = G.PRISM, RG = CAD && CAD.ref;
  if (!RG || !RG.solf || !P || !P.addGroup) return;
  const IC = {
    del: '<path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8" opacity=".45"/><path d="M8 5.5l8 4.5" stroke-width="2.4"/><path d="M16 5.5L8 10" stroke-width="2.4"/>',
    repl: '<path d="M3 16l9 4 9-4"/><path d="M3 16V10l9-4 9 4v6" opacity=".45"/><path d="M5 9c4-5 10 1 14-3" stroke-dasharray="3 2.2"/><path d="M12 11V4M9 7l3-3 3 3"/>'
  };
  const open = (type) => () => { try { RG.openPanel(type, {}); } catch (e) { P.toast && P.toast(e.message || String(e), true); } };
  const items = [
    ['solDelBtn', 'Delete face', open('solDelFace'), 'Delete faces of a solid and heal the gap (holes, pockets, bosses, fillets, chamfers), or leave an open shell', IC.del],
    ['solReplBtn', 'Replace face', open('solReplFace'), 'Replace a face with a plane, a flat face or a surface (material is added or removed)', IC.repl]
  ];
  ['model', 'part', 'partx'].forEach((tab) => P.addGroup(tab, 'Face tools', items, 'Reference'));
  ['surface', 'nurbsx'].forEach((tab) => P.addGroup(tab, 'Face tools', items, 'Surface tools'));
})(window);
