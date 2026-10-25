"""Fix 1: Search / command palette + shortcut list built from the tool registry (P.groups): no tab switching, no 40 cap."""
def S(h,old,new):
    assert h.count(old)==1,(old[:90],h.count(old)); return h.replace(old,new)
def apply(h):
    # ---- palette: list from the registry
    a=h.index("  function harvest() {\n    const cur = st.tab, seen = new Map();\n    TABS.forEach(t => { try { P.setTab(t); }")
    b=h.index("    const extra = [['@section'", a)
    new_head = """  function harvest() {
    // 8.18.1: the list is read from the tool registry (P.groups). It no longer switches through all 15 tabs, so it opens instantly,
    // never rebuilds the toolbar, never skips a tab and lists every tool (the old list was also capped at 40).
    const seen = new Map(), G = P.groups || [];
    const add = (g, tab) => g.items.forEach(it => { const id = 'tb-' + it[0]; if (seen.has(id)) return; seen.set(id, { id, label: String(it[1] == null ? it[0] : it[1]).trim(), title: it[3] || '', tab, group: (tab ? '' : 'All tabs › ') + g.title, run: it[2] }); });
    TABS.forEach(t => G.filter(g => g.tab === t).forEach(g => add(g, t)));
    G.filter(g => g.tab === 'all').forEach(g => add(g, null));
    G.forEach(g => { if (g.tab !== 'all' && TABS.indexOf(g.tab) < 0) add(g, g.tab); });
"""
    h=h[:a]+new_head+h[b:]
    h=S(h,"    CMDS = [...seen.values()].concat(extra.map(([id, label, title, fn]) => ({ id, label, title, tab: null, group: 'Command', fn })));\n    TABS.forEach(t => CMDS.push({ id: '@tab-' + t, label: 'Go to ' + TABNAME[t] + ' tab'",
         "    CMDS = [...seen.values()].concat(extra.map(([id, label, title, fn]) => ({ id, label, title, tab: null, group: 'Command', fn })));\n    TABS.forEach(t => CMDS.push({ id: '@tab-' + t, label: 'Go to ' + (TABNAME[t] || t) + ' tab'")
    # ---- run a command: switch tab once, click; fall back to the registered function
    h=S(h,"  function runCmd(c) { if (c.fn) return c.fn(); if (c.tab && st.tab !== c.tab) P.setTab(c.tab); let b = document.getElementById(c.id); if (!b) { for (const t of TABS) { P.setTab(t); b = document.getElementById(c.id); if (b) break; } } if (!b) return P.toast('That tool is not available here', true); b.click(); }",
         "  function runCmd(c) {\n    if (c.fn) return c.fn();\n    if (st.sketching) return P.toast('Finish or cancel the sketch first (Enter / Esc)', true);\n    if (c.tab && st.tab !== c.tab) P.setTab(c.tab);\n    const b = document.getElementById(c.id); if (b) return b.click();\n    if (typeof c.run === 'function') { try { c.run({}); } catch (err) { console.error(err); P.toast(err.message || String(err), true); } return; }\n    P.toast('That tool is not available here', true);\n  }")
    # ---- palette rendering: no cap, group headings when the box is empty
    h=S(h,"    else pRes = CMDS.map(c => [c, score(c, q)]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 40).map(x => x[0]);",
         "    else pRes = CMDS.map(c => [c, score(c, q)]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).map(x => x[0]);")
    old="    pls.innerHTML = pRes.map((c, i) => `<div class=\"it ${i === pSel ? 'on' : ''}\" data-i=\"${i}\">"
    assert h.count(old)==1, h.count(old)
    i=h.index(old); j=h.index("</div>`).join('')", i)
    seg=h[i:j+len("</div>`).join('')")]
    seg2=seg.replace("pls.innerHTML = pRes.map((c, i) => `<div class=\"it ${i === pSel ? 'on' : ''}\" data-i=\"${i}\">",
        "let lastG = null; const gkey = (c) => (c.tab ? (TABNAME[c.tab] || c.tab) + ' › ' : '') + c.group;\n      pls.innerHTML = (q === '?keys' ? '' : `<div class=\"x10gh x10gc\">${q ? (pRes.length ? pRes.length + ' of ' + CMDS.length + ' commands' : 'No matching command') : 'All ' + CMDS.length + ' commands · type to filter'}</div>`) + pRes.map((c, i) => { const gk = gkey(c), hd = (!q && gk !== lastG) ? `<div class=\"x10gh\">${esc(gk)}</div>` : ''; lastG = gk; return hd + `<div class=\"it ${i === pSel ? 'on' : ''}\" data-i=\"${i}\">")
    seg2=seg2.replace("</div>`).join('')","</div>`; }).join('')")
    seg2=seg2.replace("${esc(c.tab ? TABNAME[c.tab] + ' › ' : '')}${esc(c.group)}","${esc(c.tab ? (TABNAME[c.tab] || c.tab) + ' › ' : '')}${esc(c.group)}")
    assert seg2!=seg
    h=h[:i]+seg2+h[i+len(seg):]
    # heading style
    h=S(h,"document.body.appendChild(pal);\n  const pin = pal.querySelector('input'), pls = pal.querySelector('.ls');",
         "document.body.appendChild(pal);\n  { const sx = document.createElement('style'); sx.textContent = '#x10pal .x10gh{position:sticky;top:0;z-index:1;background:#141a26;color:#ff8a3d;font:700 11px \"Segoe UI\",sans-serif;letter-spacing:.08em;text-transform:uppercase;padding:6px 12px 4px;border-top:1px solid #232b3a}#x10pal .x10gh.x10gc{color:#8b98ae;text-transform:none;letter-spacing:0;font-weight:600;border-top:0}'; document.head.appendChild(sx); }\n  const pin = pal.querySelector('input'), pls = pal.querySelector('.ls');")
    # ---- shortcut-assignment list (Controls): same registry, same cure
    a=h.index("  function harvestTools() {\n    if (TOOLS) return TOOLS;"); b=h.index("  function runAction(id) {", a)
    h=h[:a]+"""  function harvestTools() {
    if (TOOLS) return TOOLS;
    const seen = new Map(), G = P.groups || [];
    const add = (g, t) => g.items.forEach(it => { const id = 'tb-' + it[0]; if (seen.has(id)) return; seen.set(id, { id: 'tool:' + id, label: String(it[1] == null ? it[0] : it[1]).trim(), group: (t ? (TABNAME[t] || t) : 'All tabs') + ' › ' + g.title, def: null, tool: true }); });
    TABS.forEach(t => G.filter(g => g.tab === t).forEach(g => add(g, t)));
    G.filter(g => g.tab === 'all').forEach(g => add(g, null));
    G.forEach(g => { if (g.tab !== 'all' && TABS.indexOf(g.tab) < 0) add(g, g.tab); });
    TOOLS = [...seen.values()]; return TOOLS;
  }
  function runTool(bid) {
    let b = document.getElementById(bid), it = null, g = null;
    if (!b) { for (const x of (P.groups || [])) { it = x.items.find(q => 'tb-' + q[0] === bid); if (it) { g = x; break; } } if (g && g.tab !== 'all' && st.tab !== g.tab) { P.setTab(g.tab); b = document.getElementById(bid); } }
    if (b) return b.click();
    if (it && typeof it[2] === 'function' && !st.sketching) { try { it[2]({}); } catch (err) { console.error(err); P.toast(err.message || String(err), true); } return; }
    P.toast('That tool is not available (is its group hidden?)', true);
  }
"""+h[b:]
    return h
