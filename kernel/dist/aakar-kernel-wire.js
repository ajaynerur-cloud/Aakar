/* Aakar 8.11 · AakarKernel wiring.
 * Plugs the built-in exact B-rep kernel into the optional exact-kernel framework of Aakar (CAD.exact): exact booleans of exact bodies, exact volume /
 * area / centroid / inertia, exact STEP export and the conformance self-test, all offline and without any WebAssembly.  OpenCascade stays available as
 * an alternative engine when its binding is installed.  Any failure inside the kernel falls back to the built-in faceted result, so it can never break a model. */
(function (G) {
  'use strict';
  const CAD = G.CAD, X = CAD && CAD.exact, AKm = G.AakarKernel, P = G.PRISM, IK = CAD && CAD.ik;
  if (!X || !AKm || !AKm.kernel) { try { console.warn('AakarKernel: exact-kernel framework not found, kernel not wired'); } catch (e) { /* ignore */ } return; }
  const K = AKm.kernel, st = P && P.st, rec = (s) => X.recipeOf(s);
  X.builtin = K;
  const stored = () => { try { return G.localStorage.getItem('aakar.exact.booleans'); } catch (e) { return null; } };
  const refresh = () => { try { const F = CAD.feat; if (F && st && st.doc && F.invalidate) { F.invalidate(st.doc, 0); P.regenerate(); } } catch (e) { /* ignore */ } };
  function chip() {
    const el = G.document && G.document.getElementById('stKernel'); if (!el) return;
    const ok = X.state === 'ready', mine = ok && X.name === 'AakarKernel';
    el.textContent = '◈ ' + (ok ? X.name : (X.state === 'loading' ? 'loading exact kernel…' : 'faceted kernel')) + (ok && X.useExactBooleans ? ' · exact' : '');
    el.className = ok ? 'on' : ''; el.title = ok ? (mine ? 'AakarKernel ' + K.version + ' — exact B-rep kernel (built in, offline). Click for exact properties, STEP export and the self-test.' : X.name + ' ' + X.version + ' — click for the exact-kernel panel') : 'No exact kernel active — click to open the panel';
  }
  const pref = (v) => { try { if (v === undefined) return G.localStorage.getItem('aakar.exact.engine'); G.localStorage.setItem('aakar.exact.engine', v); } catch (e) { /* ignore */ } return null; };
  X.useAakarKernel = function (remember) {
    X.useKernel(K, { name: 'AakarKernel', version: K.version });
    X.useExactBooleans = stored() !== '0';                         // on by default; the checkbox in the panel stores the user's choice
    if (remember) pref('aakar');
    chip(); return X;
  };
  X.useOpenCascade = async function () {
    X.state = 'absent'; X.kernel = null; X.loading = null;
    let timer = null;
    const ok = await Promise.race([X.load().then(() => X.state === 'ready'), new Promise((res) => { timer = setTimeout(() => res(false), 90000); })]);   // compiling the WebAssembly can take a while on first start
    if (timer) clearTimeout(timer);
    if (!ok || X.state !== 'ready') { const why = X.error; X.loading = null; X.useAakarKernel(); X.log.push('OpenCascade not available — AakarKernel stays active' + (why ? ' (' + why + ')' : '')); return false; }
    X.useExactBooleans = stored() !== '0'; pref('occt');
    chip(); refresh(); return true;
  };
  /** exact properties of every exact body: volume, area, centroid, inertia tensor (unit density), B-rep structure and validity */
  X.properties = function () {
    if (X.state !== 'ready' || !X.kernel.massProps) throw new Error('The active exact kernel does not report mass properties');
    return X.exactBodies().map((b) => {
      const h = X.replay(rec(b.solid)), mp = X.kernel.massProps(h), info = X.kernel.info ? X.kernel.info(h) : null, val = X.kernel.validate ? X.kernel.validate(h) : null;
      return { name: b.name, volume: mp.volume, area: mp.area, centroid: mp.centroid, inertia: mp.inertia, approximate: mp.approximateFaces || 0, info, valid: val ? val.ok : null, issues: val ? val.issues : [] };
    });
  };
  X.showProps = function () { try { X.lastProps = X.properties(); } catch (e) { try { (IK && IK.toast ? IK.toast : P.toast)(e.message, true); } catch (e2) { /* ignore */ } } X.openPanel(); };
  /** an INSTALLED kernel: a newer AakarKernel built by the GitHub workflow and placed in the folder kernel/ next to this file (the exe carries it inside app/kernel/).
   *  It is a drop-in engine, like OpenCascade, and is used automatically when it is newer than the built-in one (unless you chose the built-in one). */
  const vnum = (v) => String(v || '0').split('.').map((x) => +x || 0), newer = (a, b) => { const A = vnum(a), B = vnum(b); for (let i = 0; i < 3; i++) { if ((A[i] || 0) !== (B[i] || 0)) return (A[i] || 0) > (B[i] || 0); } return false; };
  X.installed = { checked: false, found: false };
  X.checkInstalledKernel = function () {
    return new Promise((res) => {
      const fin = (ok, why) => { const k = ok && G.AakarKernelInstalled && G.AakarKernelInstalled.kernel; X.installed = { checked: true, found: !!k, reason: why || '', version: k ? k.version : '', newer: k ? newer(k.version, K.version) : false, at: new Date().toLocaleTimeString() }; try { chip(); if (X.openPanelRefresh) X.openPanelRefresh(); } catch (e) { /* ignore */ } res(X.installed); };
      try {
        if (G.AakarKernelInstalled && G.AakarKernelInstalled.kernel) return fin(true);
        const d = G.document; if (!d) return fin(false, 'no document');
        const el = d.createElement('script'); el.src = 'kernel/aakar-kernel.installable.js'; el.async = true;
        el.onload = () => fin(!!(G.AakarKernelInstalled && G.AakarKernelInstalled.kernel), 'the file loaded but holds no kernel'); el.onerror = () => { el.remove(); fin(false, 'folder kernel/ not found next to this file'); }; d.head.appendChild(el);
      } catch (e) { fin(false, e.message || String(e)); }
    });
  };
  X.useInstalledKernel = function (remember) {
    const A = G.AakarKernelInstalled; if (!A || !A.kernel) throw new Error('No installed kernel was found. Run Check first.');
    if (!A.kernel.construct && K.construct) A.kernel.construct = K.construct;
    X.useKernel(A.kernel, { name: 'AakarKernel (installed)', version: A.kernel.version });
    X.useExactBooleans = stored() !== '0'; if (remember) pref('installed'); chip(); refresh(); return X;
  };
  /** OpenCascade as a helper for single operations: AakarKernel stays the engine, and an operation it cannot do is handed to OpenCascade (see K.hybrid in 86_hybrid.js) */
  X.occtInstance = null;
  X.loadOcct = async function () {
    if (X.occtInstance) return X.occtInstance;
    const d = G.document, desk = !!(G.aakarDesktop && G.aakarDesktop.isDesktop); let err = null;
    if (!G.AakarOcctBinding && desk) { try { const mod = await import(X.moduleUrl); const init = mod.init || (mod.default && mod.default.init); if (init) G.AakarOcctBinding = { name: mod.name || 'occt', version: mod.version || '', init }; } catch (e) { err = e; } }
    if (!G.AakarOcctBinding && d) { try { await new Promise((res, rej) => { const el = d.createElement('script'); el.src = 'occt/aakar-occt.js'; el.async = true; el.onload = res; el.onerror = () => { el.remove(); rej(new Error('folder occt/ not found next to this file')); }; d.head.appendChild(el); }); } catch (e) { err = e; } }
    if (!G.AakarOcctBinding) throw new Error(err ? (err.message || String(err)) : 'OpenCascade is not installed');
    X.occtInstance = await G.AakarOcctBinding.init({ base: desk ? X.moduleUrl.replace(/[^/]*$/, '') : 'occt/' }); return X.occtInstance;
  };
  X.useHybrid = async function (remember) {
    if (!K.hybrid) throw new Error('this kernel build has no OpenCascade fallback');
    const occ = await X.loadOcct(), cur = X.kernel && X.kernel.isHybrid ? X.kernel.primary : (X.kernel === (G.AakarKernelInstalled && G.AakarKernelInstalled.kernel) ? X.kernel : K);
    const h = K.hybrid(cur, occ, { onNote: (s) => { try { X.log.push('hybrid: ' + s); } catch (e) { /* ignore */ } } });
    X.useKernel(h, { name: (cur === K ? 'AakarKernel' : 'AakarKernel (installed)') + ' + OpenCascade', version: cur.version }); X.useExactBooleans = stored() !== '0'; if (remember) pref('hybrid'); chip(); refresh(); return h;
  };
  X.useAakarKernel();
  try { G.setTimeout(() => { X.checkInstalledKernel().then((r) => { if (r.found && pref() !== 'aakar' && (pref() === 'installed' || r.newer) && X.name === 'AakarKernel') { try { X.useInstalledKernel(); X.log.push('installed AakarKernel ' + r.version + ' is active'); } catch (e) { /* stays built-in */ } } }); }, 700); } catch (e) { /* ignore */ }
  if (pref() === 'hybrid') { try { G.setTimeout(() => { X.useHybrid().catch((e) => { try { X.log.push('OpenCascade helper not available: ' + (e.message || e)); } catch (e2) { /* ignore */ } }); }, 900); } catch (e) { /* ignore */ } }
  if (pref() === 'occt') { try { G.setTimeout(() => { X.useOpenCascade().then(chip); }, 400); } catch (e) { /* ignore */ } }
  // status-bar chip
  try {
    const d = G.document, foot = d && d.getElementById('status');
    if (foot && !d.getElementById('stKernel')) {
      const css = d.createElement('style'); css.textContent = '#stKernel{margin-left:12px;padding:0 9px;height:18px;line-height:18px;border-radius:9px;border:1px solid #3a4660;color:#9aa8bf;font-size:11px;cursor:pointer;white-space:nowrap;user-select:none}#stKernel.on{color:#ffb178;border-color:#6b4a2a;background:#2d2418}#stKernel:hover{border-color:#ff8a3d}'; d.head.appendChild(css);
      const el = d.createElement('span'); el.id = 'stKernel'; el.onclick = () => X.openPanel(); foot.appendChild(el); chip();
    }
  } catch (e) { /* the chip is an extra */ }
  try { G.addEventListener('storage', chip); } catch (e) { /* ignore */ }
  X.chip = chip;
})(typeof window !== 'undefined' ? window : globalThis);
