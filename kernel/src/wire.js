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
  X.useAakarKernel();
  if (pref() === 'occt') { try { G.setTimeout(() => { X.useOpenCascade().then(chip); }, 400); } catch (e) { /* ignore */ } }   // the user last chose OpenCascade: bring it back (falls back to AakarKernel if it is not there)
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
