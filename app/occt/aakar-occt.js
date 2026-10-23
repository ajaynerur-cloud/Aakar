/* Classic-script loader for the OpenCascade binding (web build and desktop fallback): the real code is the ES module next to this file.
 * Aakar's exact-kernel framework loads this file on demand and then calls window.AakarOcctBinding.init(). */
(function (G) {
  'use strict';
  let mod = null;
  const load = () => mod || (mod = import('./aakar-occt.mjs'));
  G.AakarOcctBinding = {
    name: 'OpenCascade (occt-wasm)', version: 'occt-wasm',
    init: (opts) => load().then((m) => m.init(opts)).then((k) => { G.AakarOcctBinding.version = k.version || 'occt-wasm'; return k; }, (e) => { mod = null; throw e; })
  };
})(window);
