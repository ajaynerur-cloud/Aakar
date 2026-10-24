/* Classic-script loader for an SMLib binding built as an ES module (web build and desktop fallback): the real code is aakar-smlib.mjs next to
 * this file, which YOU provide from your licensed SMLib (see README.md). Aakar's Exact-kernel panel loads this file when Engine ▸ SMLib is chosen
 * and calls window.AakarSmlibBinding.init(). Without aakar-smlib.mjs the import fails and AakarKernel stays active. */
(function (G) {
  'use strict';
  let mod = null; const here = (document.currentScript && document.currentScript.src) || new URL('smlib/aakar-smlib.js', location.href).href;
  const load = () => mod || (mod = import(new URL('./aakar-smlib.mjs', here).href));
  G.AakarSmlibBinding = {
    name: 'SMLib', version: '',
    init: (opts) => load().then((m) => m.init(opts)).then((k) => { G.AakarSmlibBinding.version = k.version || ''; return k; }, (e) => { mod = null; delete G.AakarSmlibBinding; throw e; })
  };
})(window);
