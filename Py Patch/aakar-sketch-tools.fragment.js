    /* ===== Aakar 8.19.1 · Wave 1 · live sketch tools: FILLET · TRIM · EXTEND · OFFSET · MIRROR (inserted into the sketcher) ===== */
    const SKX = (() => {
      const TOOLS = new Set(['fillet', 'trim', 'extend', 'offset', 'mirror', 'patlin', 'patcir', 'blkins']);
      const V = { r: 5, d: 5, n: 4, a: 360, rot: 0, blk: '', comb: false, combS: 1 };
      const E9 = 1e-9, DIMT = new Set(['length', 'distance', 'hdist', 'vdist', 'radius', 'diameter', 'angle']);
      const HINT = {
        fillet: 'FILLET: click two lines that meet at a corner, or click the corner point itself. Radius = R box. Dimensions on those lines are released.',
        trim: 'TRIM: click the part of a line, arc or circle to remove — it is cut back to the nearest crossing curves.',
        extend: 'EXTEND: click near the end of a line or arc — it grows to the nearest curve in its path.',
        offset: 'OFFSET: click a line, arc or circle on the side you want — the whole connected chain is offset by the d box.',
        mirror: 'MIRROR: first select the entities (Select tool), then pick this tool and click the mirror line. Mirrored points stay symmetric.',
        patlin: 'LINEAR PATTERN: select lines / arcs / circles first, then click a start point and an end point — n copies are laid along that vector (n box).',
        patcir: 'CIRCULAR PATTERN: select lines / arcs / circles first, then click the centre — n copies are spread over the angle in the ∠ box (360 = full circle).',
        blkins: 'INSERT BLOCK: choose a block in the list, set the rotation (rot box) and click where it goes. Make a block from the current selection with the “Make block” button.'
      };
      const sub = (a, b) => [a[0] - b[0], a[1] - b[1]], add = (a, b) => [a[0] + b[0], a[1] + b[1]], mul = (a, k) => [a[0] * k, a[1] * k];
      const dot = (a, b) => a[0] * b[0] + a[1] * b[1], crs = (a, b) => a[0] * b[1] - a[1] * b[0], len = (a) => Math.hypot(a[0], a[1]), unit = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
      const md = (x, m) => { x %= m; return x < 0 ? x + m : x; };
      const isRefLine = (e) => e.type === 'line' && !!e.ref;
      function G(e) {
        if (e.type === 'line') return { t: 'line', a: P(e.p1), b: P(e.p2), inf: !!e.ref };
        if (e.type === 'circle') return { t: 'circle', c: P(e.c), r: e.r };
        if (e.type === 'arc') { const c = P(e.c), a = P(e.p1), b = P(e.p2), r = Math.hypot(a[0] - c[0], a[1] - c[1]), { a1, sw } = K.arcAngles(c, a, b); return { t: 'arc', c, r, a1, sw, a, b }; }
        return null;
      }
      const ok = (e) => e && (e.type === 'line' || e.type === 'circle' || e.type === 'arc');
      function lineCircle(l, c) {
        const d = sub(l.b, l.a), f = sub(l.a, c.c), A = dot(d, d), B = 2 * dot(f, d), C = dot(f, f) - c.r * c.r, D = B * B - 4 * A * C; if (D < 0 || A < 1e-18) return [];
        const s = Math.sqrt(D), ts = D < 1e-12 ? [-B / (2 * A)] : [(-B - s) / (2 * A), (-B + s) / (2 * A)]; return ts.map((t) => add(l.a, mul(d, t)));
      }
      function circleCircle(a, b) {
        const d = len(sub(b.c, a.c)); if (d < 1e-12 || d > a.r + b.r + 1e-9 || d < Math.abs(a.r - b.r) - 1e-9) return [];
        const x = (d * d + a.r * a.r - b.r * b.r) / (2 * d), h = Math.sqrt(Math.max(0, a.r * a.r - x * x)), u = mul(sub(b.c, a.c), 1 / d), m = add(a.c, mul(u, x)), n = [-u[1], u[0]];
        return h < 1e-9 ? [m] : [add(m, mul(n, h)), sub(m, mul(n, h))];
      }
      function isect(g1, g2) {
        if (g1.t === 'line' && g2.t === 'line') { const d1 = sub(g1.b, g1.a), d2 = sub(g2.b, g2.a), den = crs(d1, d2); if (Math.abs(den) < 1e-12 * len(d1) * len(d2)) return []; return [add(g1.a, mul(d1, crs(sub(g2.a, g1.a), d2) / den))]; }
        if (g1.t === 'line') return lineCircle(g1, g2); if (g2.t === 'line') return lineCircle(g2, g1); return circleCircle(g1, g2);
      }
      function param(g, p) {            // line: t in 0..1 · arc/circle: angle travelled from the start
        if (g.t === 'line') { const d = sub(g.b, g.a); return dot(sub(p, g.a), d) / dot(d, d); }
        const a = Math.atan2(p[1] - g.c[1], p[0] - g.c[0]); return g.t === 'arc' ? md(a - g.a1, 2 * Math.PI) : md(a, 2 * Math.PI);
      }
      const span = (g) => (g.t === 'line' ? 1 : g.t === 'arc' ? g.sw : 2 * Math.PI);
      function inRange(g, p, tol) {
        if (g.t === 'circle' || g.inf) return true; const s = param(g, p); if (g.t === 'line') { const tt = (tol || 1e-7) / Math.max(1e-9, len(sub(g.b, g.a))); return s >= -tt && s <= 1 + tt; }
        return s <= g.sw + (tol || 1e-7) / Math.max(1e-9, g.r) || s >= 2 * Math.PI - 1e-9;
      }
      const ptAt = (g, s) => g.t === 'line' ? add(g.a, mul(sub(g.b, g.a), s)) : [g.c[0] + g.r * Math.cos((g.t === 'arc' ? g.a1 : 0) + s), g.c[1] + g.r * Math.sin((g.t === 'arc' ? g.a1 : 0) + s)];
      const users = (pid, exceptEnt) => sk.ents.filter((x) => x.id !== exceptEnt && entPts(x).includes(pid)).length;
      function cleanup() {
        reindex();
        const used = new Set(); sk.ents.forEach((e) => entPts(e).forEach((p) => used.add(p)));
        const ids = new Set([...sk.pts.map((p) => p.id), ...sk.ents.map((e) => e.id)]);
        sk.cons = sk.cons.filter((c) => c.e.every((id) => ids.has(id)));
        const inCon = new Set(); sk.cons.forEach((c) => c.e.forEach((id) => inCon.add(id)));
        sk.pts = sk.pts.filter((p) => p.ref || used.has(p.id) || inCon.has(p.id));
        const ids2 = new Set([...sk.pts.map((p) => p.id), ...sk.ents.map((e) => e.id)]); sk.cons = sk.cons.filter((c) => c.e.every((id) => ids2.has(id)));
        reindex();
      }
      function dropDims(ids) {
        const set = new Set(ids), n0 = sk.cons.length; sk.cons = sk.cons.filter((c) => !(DIMT.has(c.type) && c.e.some((id) => set.has(id)))); return n0 - sk.cons.length;
      }
      function ownPoint(e, key, w) {     // give the entity its own end point (so moving it does not drag neighbours)
        const pid = e[key]; if (users(pid, e.id) > 0 || I.P.get(pid).fixed || I.P.get(pid).ref) { const n = addPt(w[0], w[1]); e[key] = n; return n; }
        const p = I.P.get(pid); p.x = w[0]; p.y = w[1]; return pid;
      }
      function pinOn(pid, cut) { if (!cut) return; const t = cut.type === 'line' ? 'pointOnLine' : 'pointOnCircle'; addCon({ type: t, e: [pid, cut.id] }); }
      function finish(before, msg, touched) {
        const dn = dropDims(touched || []);
        if (!K.solve(sk).ok) { restore(before); st.undo.pop(); toast('The sketch constraints would conflict with this edit — nothing changed', true); return false; }
        cleanup(); st.sel = []; changed(); if (msg) toast(msg + (dn ? ' · ' + dn + ' dimension' + (dn > 1 ? 's' : '') + ' on the edited geometry released' : '')); return true;
      }
      function pickEnt(sx, sy) {
        const w = toW([sx, sy]), tol = 7 / view.s; let best = null;
        sk.ents.forEach((e) => { if (!ok(e)) return; const r = entDist(e, w), d = r.d + (e.ref ? tol * 0.5 : 0); if (r.d < tol && (!best || d < best.d)) best = { kind: 'ent', id: e.id, d, q: r.q }; });
        return best;
      }
      // ---------------------------------------------------------------- FILLET
      function fillet(sx, sy) {
        const h = pick(sx, sy, { geomOnly: true }); if (!h || (h.kind !== 'pt' && h.kind !== 'ent')) return;
        let A, B;
        if (h.kind === 'pt') { const ls = sk.ents.filter((e) => e.type === 'line' && !e.ref && (e.p1 === h.id || e.p2 === h.id)); if (ls.length !== 2) return toast('Pick a corner where exactly two lines meet', true); A = ls[0]; B = ls[1]; }
        else if (h.kind === 'ent') {
          const e = I.E.get(h.id); if (!e || e.type !== 'line' || e.ref) return toast('Fillet works on two straight lines — click a line', true);
          if (!st.fil) { st.fil = e.id; st.sel = [{ kind: 'ent', id: e.id }]; draw(); return; }
          if (st.fil === e.id) { st.fil = null; st.sel = []; draw(); return; }
          A = I.E.get(st.fil); B = e; st.fil = null;
        } else return;
        const r = V.r; if (!(r > 0)) return toast('Set a radius greater than 0 in the R box', true);
        const a = G(A), b = G(B), X = isect(a, b)[0]; if (!X) return toast('Those lines are parallel — nothing to fillet', true);
        const endOf = (e, g) => (len(sub(g.a, X)) <= len(sub(g.b, X)) ? 'p1' : 'p2'), kA = endOf(A, a), kB = endOf(B, b);
        const far = (g, k) => (k === 'p1' ? g.b : g.a), uA = unit(sub(far(a, kA), X)), uB = unit(sub(far(b, kB), X));
        const cosT = clampv(dot(uA, uB)), th = Math.acos(cosT); if (th < 1e-3 || th > Math.PI - 1e-3) return toast('The lines are (almost) collinear', true);
        const t = r / Math.tan(th / 2), LA = len(sub(far(a, kA), X)), LB = len(sub(far(b, kB), X));
        if (t > LA - 1e-6 || t > LB - 1e-6) return toast('Radius too large for these lines (max about ' + (Math.min(LA, LB) * Math.tan(th / 2)).toFixed(2) + ')', true);
        const TA = add(X, mul(uA, t)), TB = add(X, mul(uB, t)), C = add(X, mul(unit(add(uA, uB)), r / Math.sin(th / 2)));
        const before = snap(); push();
        const pa = ownPoint(A, kA, TA), pb = ownPoint(B, kB, TB);
        const pc = addPt(C[0], C[1]), ccw = crs(sub(TA, C), sub(TB, C)) > 0;
        const arc = addEnt(ccw ? { type: 'arc', c: pc, p1: pa, p2: pb } : { type: 'arc', c: pc, p1: pb, p2: pa }); if (A.constr || B.constr) arc.constr = true;
        addCon({ type: 'tangent', e: [A.id, arc.id] }); addCon({ type: 'tangent', e: [B.id, arc.id] });
        finish(before, 'Fillet R ' + r + ' added', [A.id, B.id, pa, pb]);
      }
      const clampv = (x) => Math.max(-1, Math.min(1, x));
      // ---------------------------------------------------------------- cutters
      function cutters(self) { return sk.ents.filter((o) => o.id !== self.id && ok(o)).map((o) => ({ o, g: G(o) })); }
      function hitsOn(e, g) {
        const out = [];
        cutters(e).forEach(({ o, g: go }) => isect(g, go).forEach((p) => { if (!inRange(go, p)) return; const s = param(g, p); out.push({ s, p, o }); }));
        out.sort((x, y) => x.s - y.s); const res = [];
        out.forEach((h) => { if (!res.length || Math.abs(h.s - res[res.length - 1].s) > 1e-7) res.push(h); });
        return res;
      }
      const delEnt = (e) => { sk.ents = sk.ents.filter((x) => x.id !== e.id); reindex(); };
      function cloneGeomCons(from, to) { sk.cons.filter((c) => (c.type === 'horizontal' || c.type === 'vertical') && c.e.length === 1 && c.e[0] === from.id).forEach((c) => addCon({ type: c.type, e: [to.id] })); }
      // ---------------------------------------------------------------- TRIM
      function trim(sx, sy) {
        const h = pickEnt(sx, sy); if (!h) return;
        const e = I.E.get(h.id); if (!e || e.ref) return; if (!ok(e)) return toast('Trim works on lines, arcs and circles', true);
        const g = G(e), w = toW([sx, sy]), S = span(g); let sc = param(g, h.q || w); const hits = hitsOn(e, g).filter((x) => g.t === 'circle' || (x.s > 1e-7 && x.s < S - 1e-7));
        const before = snap(); push(); const touched = [e.id];
        if (g.t === 'circle') {
          if (hits.length < 2) { restore(before); st.undo.pop(); return toast('A circle needs two crossing curves to be trimmed', true); }
          let lo = null, hi = null; hits.forEach((x) => { if (x.s <= sc) lo = x; }); lo = lo || hits[hits.length - 1]; hi = hits.find((x) => x.s > sc) || hits[0];
          const pl = addPt(lo.p[0], lo.p[1]), ph = addPt(hi.p[0], hi.p[1]), cpid = e.c; delEnt(e);
          const arc = addEnt({ type: 'arc', c: cpid, p1: ph, p2: pl }); pinOn(pl, lo.o); pinOn(ph, hi.o); touched.push(arc.id, pl, ph);
          return finish(before, 'Circle trimmed to an arc', touched);
        }
        const lo = [...hits].reverse().find((x) => x.s < sc), hi = hits.find((x) => x.s > sc);
        if (!lo && !hi) { delEnt(e); return finish(before, 'Entity deleted (nothing crosses it)', touched); }
        if (lo && hi) {
          const pl = addPt(lo.p[0], lo.p[1]), ph = addPt(hi.p[0], hi.p[1]), oldEnd = e.p2;
          const n = addEnt(e.type === 'line' ? { type: 'line', p1: ph, p2: oldEnd } : { type: 'arc', c: e.c, p1: ph, p2: oldEnd }); if (e.constr) n.constr = true;
          e.p2 = pl; cloneGeomCons(e, n); pinOn(pl, lo.o); pinOn(ph, hi.o); touched.push(n.id, pl, ph);
          return finish(before, 'Trimmed', touched);
        }
        if (lo) { const pid = ownPoint(e, 'p2', lo.p); pinOn(pid, lo.o); touched.push(pid); } else { const pid = ownPoint(e, 'p1', hi.p); pinOn(pid, hi.o); touched.push(pid); }
        return finish(before, 'Trimmed', touched);
      }
      // ---------------------------------------------------------------- EXTEND
      function extend(sx, sy) {
        const h = pickEnt(sx, sy); if (!h) return;
        const e = I.E.get(h.id); if (!e || e.ref || (e.type !== 'line' && e.type !== 'arc')) return toast('Extend works on lines and arcs — click near one end', true);
        const g = G(e), w = toW([sx, sy]); let best = null, key;
        if (g.t === 'line') {
          key = len(sub(w, g.a)) <= len(sub(w, g.b)) ? 'p1' : 'p2'; const end = key === 'p1' ? g.a : g.b, dir = unit(key === 'p1' ? sub(g.a, g.b) : sub(g.b, g.a));
          cutters(e).forEach(({ o, g: go }) => isect({ t: 'line', a: g.a, b: g.b }, go).forEach((p) => { if (!inRange(go, p)) return; const t = dot(sub(p, end), dir); if (t > 1e-7 && (!best || t < best.t)) best = { t, p, o }; }));
        } else {
          key = len(sub(w, g.a)) <= len(sub(w, g.b)) ? 'p1' : 'p2'; const aEnd = key === 'p1' ? g.a1 : g.a1 + g.sw;
          cutters(e).forEach(({ o, g: go }) => isect({ t: 'circle', c: g.c, r: g.r }, go).forEach((p) => {
            if (!inRange(go, p)) return; const ang = Math.atan2(p[1] - g.c[1], p[0] - g.c[0]), d = key === 'p2' ? md(ang - aEnd, 2 * Math.PI) : md(aEnd - ang, 2 * Math.PI);
            if (d > 1e-7 && d < 2 * Math.PI - g.sw - 1e-7 && (!best || d < best.t)) best = { t: d, p, o };
          }));
        }
        if (!best) return toast('Nothing in the way — the end has no curve to extend to', true);
        const before = snap(); push(); const pid = ownPoint(e, key, best.p); pinOn(pid, best.o);
        finish(before, 'Extended', [e.id, pid]);
      }
      // ---------------------------------------------------------------- OFFSET
      function chainOf(e0) {
        const okc = (x) => (x.type === 'line' || x.type === 'arc') && !x.ref, byPt = new Map();
        sk.ents.forEach((x) => { if (!okc(x)) return; [x.p1, x.p2].forEach((p) => { if (!byPt.has(p)) byPt.set(p, []); byPt.get(p).push(x); }); });
        const chain = [{ e: e0, fwd: true }], used = new Set([e0.id]);
        const walk = (pid, back) => { for (;;) { const nx = (byPt.get(pid) || []).filter((x) => !used.has(x.id)); if (nx.length !== 1) return pid; const x = nx[0]; used.add(x.id); const fw = x.p1 === pid; if (back) chain.unshift({ e: x, fwd: !fw }); else chain.push({ e: x, fwd: fw }); pid = fw ? x.p2 : x.p1; } };
        const endF = walk(e0.p2, false); const closed = endF === e0.p1; if (!closed) walk(e0.p1, true);
        return { chain, closed };
      }
      function offsetCurve(it, s, d) {
        const g = G(it.e);
        if (g.t === 'line') { const a = it.fwd ? g.a : g.b, b = it.fwd ? g.b : g.a, u = unit(sub(b, a)), n = [-u[1], u[0]], o = mul(n, s * d); return { t: 'line', a: add(a, o), b: add(b, o), a0: a, b0: b }; }
        const r2 = it.fwd ? g.r - s * d : g.r + s * d; if (r2 <= 1e-6) return null;
        const aS = it.fwd ? g.a1 : g.a1 + g.sw, aE = it.fwd ? g.a1 + g.sw : g.a1, pt = (ang) => [g.c[0] + r2 * Math.cos(ang), g.c[1] + r2 * Math.sin(ang)];
        return { t: 'arc', c: g.c, r: r2, a: pt(aS), b: pt(aE), a0: it.fwd ? g.a : g.b, b0: it.fwd ? g.b : g.a, fwd: it.fwd, e: it.e };
      }
      function offset(sx, sy) {
        const h = pickEnt(sx, sy); if (!h) return; const e0 = I.E.get(h.id); if (!e0 || e0.ref || !ok(e0)) return toast('Offset works on lines, arcs and circles', true);
        const d = V.d; if (!(d > 0)) return toast('Set a distance greater than 0 in the d box', true); const w = toW([sx, sy]), before = snap(); push();
        if (e0.type === 'circle') {
          const c = P(e0.c), out = len(sub(w, c)) > e0.r, r2 = out ? e0.r + d : e0.r - d; if (r2 <= 1e-6) { restore(before); st.undo.pop(); return toast('Offset distance is larger than the circle', true); }
          const pc = addPt(c[0], c[1]), n = addEnt({ type: 'circle', c: pc, r: r2 }); if (e0.constr) n.constr = true; addCon({ type: 'coincident', e: [pc, e0.c] });
          return finish(before, 'Circle offset', []);
        }
        const g0 = G(e0); let s;
        if (g0.t === 'line') s = crs(sub(g0.b, g0.a), sub(w, g0.a)) > 0 ? 1 : -1; else s = len(sub(w, g0.c)) < g0.r ? 1 : -1;
        const { chain, closed } = chainOf(e0), cur = chain.map((it) => offsetCurve(it, s, d));
        if (cur.some((x) => !x)) { restore(before); st.undo.pop(); return toast('Offset distance is larger than an arc in the chain', true); }
        const n = chain.length, J = [];            // J[k] = joint between item k-1 and k (k = 0..n)
        const joint = (k) => {
          const i = (k - 1 + n) % n, j = k % n, A = cur[i], B = cur[j], nominal = A.b;
          const cand = isect(A.t === 'line' ? { t: 'line', a: A.a, b: A.b } : { t: 'circle', c: A.c, r: A.r }, B.t === 'line' ? { t: 'line', a: B.a, b: B.b } : { t: 'circle', c: B.c, r: B.r });
          if (!cand.length) return nominal; return cand.reduce((a, b) => (len(sub(b, nominal)) < len(sub(a, nominal)) ? b : a));
        };
        for (let k = 0; k <= n; k++) { if (k === 0) J.push(closed ? joint(0) : cur[0].a); else if (k === n) J.push(closed ? J[0] : cur[n - 1].b); else J.push(joint(k)); }
        const ptIds = J.map((p, k) => (closed && k === n ? null : addPt(p[0], p[1]))); if (closed) ptIds[n] = ptIds[0];
        const centres = new Map();
        chain.forEach((it, k) => {
          const S = ptIds[k], T = ptIds[k + 1];
          if (it.e.type === 'line') { const ne = addEnt(it.fwd ? { type: 'line', p1: S, p2: T } : { type: 'line', p1: T, p2: S }); if (it.e.constr) ne.constr = true; addCon({ type: 'parallel', e: [it.e.id, ne.id] }); }
          else { let pc = centres.get(it.e.c); if (!pc) { const c = P(it.e.c); pc = addPt(c[0], c[1]); centres.set(it.e.c, pc); addCon({ type: 'coincident', e: [pc, it.e.c] }); } const ne = addEnt(it.fwd ? { type: 'arc', c: pc, p1: S, p2: T } : { type: 'arc', c: pc, p1: T, p2: S }); if (it.e.constr) ne.constr = true; }
        });
        finish(before, 'Offset ' + (closed ? 'loop' : 'chain') + ' of ' + n + ' curve' + (n > 1 ? 's' : '') + ' by ' + d, []);
      }
      // ---------------------------------------------------------------- MIRROR
      function mirror(sx, sy) {
        const h = pickEnt(sx, sy); const src = st.sel.filter((x) => x.kind === 'ent').map((x) => I.E.get(x.id)).filter((e) => e && ok(e) && !e.ref);
        if (!src.length) return toast('Select the entities to mirror first (Select tool), then choose Mirror and click the mirror line', true);
        if (!h || h.kind !== 'ent') return; const ax = I.E.get(h.id); if (!ax || ax.type !== 'line') return toast('Click a straight line to mirror about (a construction line or an axis works well)', true);
        if (src.includes(ax)) return toast('The mirror line cannot be one of the mirrored entities', true);
        const A = P(ax.p1), B = P(ax.p2), u = unit(sub(B, A)), refl = (p) => { const v = sub(p, A), pr = mul(u, dot(v, u)), perp = sub(v, pr); return sub(add(A, pr), perp); }, onAx = (p) => Math.abs(crs(u, sub(p, A))) < 1e-7;
        const before = snap(); push(); const map = new Map(), pairs = [];
        const mp = (pid) => { if (map.has(pid)) return map.get(pid); const p = P(pid); let np; if (onAx(p)) np = pid; else { const q = refl(p); np = addPt(q[0], q[1]); pairs.push([pid, np]); } map.set(pid, np); return np; };
        const made = [];
        src.forEach((e) => {
          if (e.type === 'line') { const ne = addEnt({ type: 'line', p1: mp(e.p1), p2: mp(e.p2) }); made.push([e, ne]); }
          else if (e.type === 'circle') { const ne = addEnt({ type: 'circle', c: mp(e.c), r: e.r }); made.push([e, ne]); }
          else { const ne = addEnt({ type: 'arc', c: mp(e.c), p1: mp(e.p2), p2: mp(e.p1) }); made.push([e, ne]); }
          if (e.constr) made[made.length - 1][1].constr = true;
        });
        pairs.forEach(([a, b]) => addCon({ type: 'symmetric', e: [a, b, ax.id] }));
        made.forEach(([e, ne]) => { if (e.type === 'circle') addCon({ type: 'equal', e: [e.id, ne.id] }); });
        let msg = 'Mirrored ' + src.length + ' entit' + (src.length > 1 ? 'ies' : 'y') + ' (kept symmetric)';
        if (!K.solve(sk).ok) { sk.cons = sk.cons.filter((c) => c.type !== 'symmetric' && !(c.type === 'equal' && made.some(([a, b]) => c.e.includes(b.id)))); msg = 'Mirrored ' + src.length + ' entities (symmetry could not be kept by constraints; copied as geometry)'; if (!K.solve(sk).ok) { restore(before); st.undo.pop(); return toast('Mirror failed because of existing constraints', true); } }
        cleanup(); st.sel = []; changed(); toast(msg);
      }

      // ---------------------------------------------------------------- PATTERNS · BLOCKS · COMB   (Wave 2)
      const BLK_KEY = 'aakar.w2.blocks';
      const loadBlocks = () => { try { return JSON.parse(localStorage.getItem(BLK_KEY) || '{}') || {}; } catch (e) { return {}; } };
      const saveBlocks = (b) => { try { localStorage.setItem(BLK_KEY, JSON.stringify(b)); } catch (e) { /* ignore */ } };
      const selSrc = () => st.sel.filter((x) => x.kind === 'ent').map((x) => I.E.get(x.id)).filter((e) => e && ok(e) && !e.ref);
      function pw(sx, sy) { const h = pick(sx, sy, { geomOnly: true }); if (h && h.kind === 'pt') return P(h.id).slice(); return toW([sx, sy]); }
      function copyWith(src, xf) {
        const map = new Map(), made = [], mp = (pid) => { if (map.has(pid)) return map.get(pid); const q = xf(P(pid)); const np = addPt(q[0], q[1]); map.set(pid, np); return np; };
        src.forEach((e) => { let ne; if (e.type === 'line') ne = addEnt({ type: 'line', p1: mp(e.p1), p2: mp(e.p2) }); else if (e.type === 'circle') ne = addEnt({ type: 'circle', c: mp(e.c), r: e.r }); else if (e.type === 'arc') ne = addEnt({ type: 'arc', c: mp(e.c), p1: mp(e.p1), p2: mp(e.p2) }); else return; if (e.constr) ne.constr = true; made.push(ne); });
        return made;
      }
      function patlin(sx, sy) {
        const src = selSrc(); if (!src.length) return toast('Select the lines / arcs / circles to repeat first (Select tool), then use the pattern', true);
        const w = pw(sx, sy); if (!st.patA) { st.patA = w; toast('Now click the end point of the pattern vector'); return; }
        const a = st.patA, n = Math.max(2, V.n | 0), vec = sub(w, a); st.patA = null; if (len(vec) < 1e-9) return toast('Start and end point are the same', true);
        const before = snap(); push(); for (let k = 1; k < n; k++) copyWith(src, (p) => add(p, mul(vec, k)));
        if (!K.solve(sk).ok) { restore(before); st.undo.pop(); return toast('Existing constraints prevent the pattern — nothing changed', true); } cleanup(); st.sel = []; changed(); toast('Linear pattern: ' + n + ' copies in total');
      }
      function patcir(sx, sy) {
        const src = selSrc(); if (!src.length) return toast('Select the lines / arcs / circles to repeat first (Select tool), then use the pattern', true);
        const c = pw(sx, sy), n = Math.max(2, V.n | 0), tot = V.a * Math.PI / 180, step = Math.abs(V.a) >= 359.999 ? tot / n : tot / (n - 1);
        const before = snap(); push(); for (let k = 1; k < n; k++) { const t = k * step, cs = Math.cos(t), sn = Math.sin(t); copyWith(src, (p) => { const d = sub(p, c); return [c[0] + d[0] * cs - d[1] * sn, c[1] + d[0] * sn + d[1] * cs]; }); }
        if (!K.solve(sk).ok) { restore(before); st.undo.pop(); return toast('Existing constraints prevent the pattern — nothing changed', true); } cleanup(); st.sel = []; changed(); toast('Circular pattern: ' + n + ' copies in total');
      }
      function makeBlock() {
        const src = selSrc(); if (!src.length) return toast('Select the lines / arcs / circles that form the block first', true);
        const ids = new Set(); src.forEach((e) => entPts(e).forEach((p) => ids.add(p))); const pts = [...ids].map((i) => ({ id: i, p: P(i) })); const xs = pts.map((q) => q.p[0]), ys = pts.map((q) => q.p[1]), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
        const lib = loadBlocks(), def = 'Block ' + (Object.keys(lib).length + 1); let name = def; try { const r = window.prompt('Name of the new block', def); if (r === null) return; name = (r || def).trim() || def; } catch (e) { /* prompt blocked: use default */ }
        lib[name] = { pts: pts.map((q) => ({ id: q.id, x: q.p[0] - cx, y: q.p[1] - cy })), ents: src.map((e) => ({ type: e.type, p1: e.p1, p2: e.p2, c: e.c, r: e.r, constr: !!e.constr })) }; saveBlocks(lib); V.blk = name; refreshBlockList(); toast('Block “' + name + '” saved (' + src.length + ' entities) — pick it in the list and use Insert block');
      }
      function blkins(sx, sy) {
        const lib = loadBlocks(), b = lib[V.blk]; if (!b) return toast('Choose a block in the list first (or make one from a selection)', true);
        const o = pw(sx, sy), a = V.rot * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a), map = new Map(), pos = new Map(b.pts.map((q) => [q.id, q]));
        const mp = (pid) => { if (map.has(pid)) return map.get(pid); const q = pos.get(pid); const np = addPt(o[0] + q.x * cs - q.y * sn, o[1] + q.x * sn + q.y * cs); map.set(pid, np); return np; };
        const before = snap(); push(); b.ents.forEach((e) => { let ne; if (e.type === 'line') ne = addEnt({ type: 'line', p1: mp(e.p1), p2: mp(e.p2) }); else if (e.type === 'circle') ne = addEnt({ type: 'circle', c: mp(e.c), r: e.r }); else if (e.type === 'arc') ne = addEnt({ type: 'arc', c: mp(e.c), p1: mp(e.p1), p2: mp(e.p2) }); else return; if (e.constr) ne.constr = true; });
        if (!K.solve(sk).ok) { restore(before); st.undo.pop(); return toast('Could not place the block', true); } cleanup(); changed(); toast('Block “' + V.blk + '” inserted');
      }
      function delBlock() { const lib = loadBlocks(); if (!lib[V.blk]) return; delete lib[V.blk]; saveBlocks(lib); V.blk = ''; refreshBlockList(); toast('Block deleted'); }
      let blkSel = null; function refreshBlockList() { if (!blkSel) return; const lib = loadBlocks(), names = Object.keys(lib); blkSel.innerHTML = '<option value="">— blocks —</option>' + names.map((n) => '<option value="' + n.replace(/"/g, '&quot;') + '"' + (n === V.blk ? ' selected' : '') + '>' + n.replace(/</g, '&lt;') + '</option>').join(''); }
      // live curvature comb (spline / NURBS / Bézier / conic / ellipse / arc / circle)
      function drawComb(ctx) {
        if (!V.comb) return; const lines = [];
        sk.ents.forEach((e) => { if (e.ref || e.type === 'line') return; let pts; try { pts = K.discretize(sk, e, 160, I); } catch (er) { return; } if (!pts || pts.length < 5) return; if (e.type === 'circle') pts = pts.concat([pts[0]]);
          const m = pts.length, k = pts.map((p, i) => { if (i === 0 || i === m - 1) return 0; const a = pts[i - 1], b = pts[i + 1], A = sub(a, p), B = sub(b, p), la = len(A), lb = len(B), cr = A[0] * B[1] - A[1] * B[0], lc = len(sub(b, a)); return la * lb * lc > 1e-18 ? -2 * cr / (la * lb * lc) : 0; });
          for (let it = 0; it < 3; it++) for (let i = 1; i < m - 1; i++) k[i] = 0.25 * k[i - 1] + 0.5 * k[i] + 0.25 * k[i + 1]; lines.push({ pts, k }); });
        if (!lines.length) return; const kmax = Math.max(1e-12, ...lines.flatMap((l) => l.k.map(Math.abs))), px = 46 * V.combS / view.s / kmax; ctx.save(); ctx.lineWidth = 1;
        lines.forEach(({ pts, k }) => { const env = []; pts.forEach((p, i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], T = unit(sub(b, a)), Nl = [-T[1], T[0]], tip = [p[0] - Nl[0] * k[i] * px, p[1] - Nl[1] * k[i] * px]; env.push(toS(tip)); if (i % 2 === 0) { const s0 = toS(p); ctx.strokeStyle = 'rgba(255,160,60,.75)'; ctx.beginPath(); ctx.moveTo(s0[0], s0[1]); ctx.lineTo(env[env.length - 1][0], env[env.length - 1][1]); ctx.stroke(); } });
          ctx.strokeStyle = '#ff7a1a'; ctx.beginPath(); env.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.stroke(); });
        ctx.restore();
      }
      const toggleComb = () => { V.comb = !V.comb; toast('Curvature comb ' + (V.comb ? 'ON — teeth show how fast each curve bends (longer = tighter)' : 'off')); draw(); };
      const run = { fillet, trim, extend, offset, mirror, patlin, patcir, blkins };
      const api = {
        is: (t) => TOOLS.has(t), hint: (t) => HINT[t],
        click: (sx, sy) => { try { run[st.tool](sx, sy); } catch (err) { toast(err.message || String(err), true); } },
        buttons: [
          ['fillet', 'Sketch fillet: click two lines that meet (or the corner point). Radius in the R box.', () => { st.fil = null; setTool('fillet'); }],
          ['trim', 'Trim: click the part of a curve to remove', () => setTool('trim')],
          ['extend', 'Extend: click near the end of a line / arc to grow it to the next curve', () => setTool('extend')],
          ['offset', 'Offset: click a curve — the connected chain is offset by the d value', () => setTool('offset')],
          ['mirror', 'Mirror: select entities first, then click the mirror line', () => setTool('mirror')]
        ],
        mountInputs: (bar) => {
          const d = document.createElement('div'); d.className = 'sk-grp';
          d.innerHTML = '<span class="sk-gl" title="Numbers used by the Modify tools">Values</span><label title="Fillet radius (mm)" style="font-size:11px;color:#9fb0c8;display:inline-flex;gap:3px;align-items:center">R <input class="skx-r" type="number" step="any" min="0" value="' + V.r + '" style="width:54px;background:#11161f;border:1px solid #2a3446;color:#e6ecf5;border-radius:4px;padding:2px 4px"></label> <label title="Offset distance (mm)" style="font-size:11px;color:#9fb0c8;display:inline-flex;gap:3px;align-items:center">d <input class="skx-d" type="number" step="any" min="0" value="' + V.d + '" style="width:54px;background:#11161f;border:1px solid #2a3446;color:#e6ecf5;border-radius:4px;padding:2px 4px"></label>';
          bar.insertBefore(d, bar.lastElementChild);
          const x = document.createElement('span'); x.style.cssText = 'display:inline-flex;gap:6px;align-items:center;margin-left:6px;font-size:11px;color:#9fb0c8'; const inp = (cls, t, v, w) => '<label title="' + t + '">' + cls.label + ' <input class="' + cls.c + '" type="number" step="any" value="' + v + '" style="width:' + w + 'px;background:#11161f;border:1px solid #2a3446;color:#e6ecf5;border-radius:4px;padding:2px 4px"></label>';
          x.innerHTML = inp({ label: 'n', c: 'skx-n' }, 'Pattern: number of copies (including the original)', V.n, 44) + inp({ label: '∠', c: 'skx-a' }, 'Circular pattern: total angle in degrees (360 = full circle)', V.a, 50) + inp({ label: 'rot', c: 'skx-rot' }, 'Block insert: rotation in degrees', V.rot, 46) + '<select class="skx-blk" title="Block library" style="max-width:110px;background:#11161f;border:1px solid #2a3446;color:#e6ecf5;border-radius:4px;padding:2px 3px"></select><button class="skx-bdel" title="Delete the chosen block" style="background:none;border:1px solid #2a3446;color:#9fb0c8;border-radius:4px;cursor:pointer;padding:1px 5px">✕</button>';
          d.appendChild(x); blkSel = x.querySelector('.skx-blk'); refreshBlockList();
          x.querySelector('.skx-n').oninput = (ev) => { V.n = parseInt(ev.target.value, 10) || 2; }; x.querySelector('.skx-a').oninput = (ev) => { V.a = parseFloat(ev.target.value) || 360; }; x.querySelector('.skx-rot').oninput = (ev) => { V.rot = parseFloat(ev.target.value) || 0; };
          blkSel.onchange = (ev) => { V.blk = ev.target.value; }; x.querySelector('.skx-bdel').onclick = () => delBlock();
          d.querySelector('.skx-r').oninput = (ev) => { V.r = parseFloat(ev.target.value); }; d.querySelector('.skx-d').oninput = (ev) => { V.d = parseFloat(ev.target.value); };
        },
        buttons2: [
          ['patlin', 'Linear pattern: select entities first, then click start and end of the vector (n box = copies)', () => { st.patA = null; setTool('patlin'); }],
          ['patcir', 'Circular pattern: select entities first, then click the centre (n copies over the ∠ angle)', () => setTool('patcir')],
          ['blkmake', 'Make block: save the selected entities in the block library', () => makeBlock()],
          ['blkins', 'Insert block: pick a block in the list, click where it goes', () => setTool('blkins')],
          ['comb', 'Curvature comb on / off — shows how fast every curve bends', () => toggleComb()]
        ],
        drawComb,
        V, _G: G, _isect: isect, loadBlocks, makeBlock, delBlock
      };
      return api;
    })();
    Object.assign(ICON, {
      fillet: '<path d="M4 20V11a7 7 0 0 1 7-7h9"/>', trim: '<path d="M3 12h18" stroke-dasharray="3 2"/><path d="M12 3v18"/><path d="M8 8l8 8M16 8l-8 8" opacity=".0"/><path d="M12 12l7-7M17 5h2v2"/>',
      extend: '<path d="M4 18h9"/><path d="M13 18h5" stroke-dasharray="2 2"/><path d="M20 4v16"/><path d="M16 14l4 4-4 4" opacity=".0"/>', offset: '<path d="M4 20V8a4 4 0 0 1 4-4h12"/><path d="M9 20v-9a2 2 0 0 1 2-2h9" stroke-dasharray="3 2"/>',
      mirror: '<path d="M12 3v18" stroke-dasharray="2 2"/><path d="M9 6L4 18h5z"/><path d="M15 6l5 12h-5z" stroke-dasharray="2 2"/>',
      patlin: '<circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/><path d="M5 18h14" stroke-dasharray="2 2"/>', patcir: '<circle cx="12" cy="5" r="2"/><circle cx="18" cy="15" r="2"/><circle cx="6" cy="15" r="2"/><path d="M12 12m-1 0a1 1 0 1 0 2 0 1 1 0 1 0-2 0"/>',
      blkmake: '<rect x="5" y="5" width="14" height="14" rx="1" stroke-dasharray="3 2"/><path d="M9 12h6 M12 9v6"/>', blkins: '<rect x="4" y="9" width="9" height="9" rx="1"/><path d="M16 4v8 M13 8l3 4 3-4"/>', comb: '<path d="M3 18c5-12 13-12 18 0"/><path d="M6 12l-2-3 M10 9.5l-.6-3.5 M14 9.5l.6-3.5 M18 12l2-3"/>'
    });
