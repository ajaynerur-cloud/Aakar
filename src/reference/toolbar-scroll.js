/* ---- tbscroll.js : visible scroll chevrons + wheel scrolling for the (wide) tool row ---- */
(function () {
  'use strict';
  function boot() {
    const tb = document.getElementById('toolbar'); if (!tb || !tb.parentElement || document.getElementById('tbL')) return setTimeout(boot, 400);
    const host = tb.parentElement;
    const mk = (id, dir, txt) => { const b = document.createElement('button'); b.id = id; b.type = 'button'; b.className = 'tbchev'; b.textContent = txt; b.title = dir < 0 ? 'Scroll tools left' : 'More tools — scroll right'; b.addEventListener('click', () => tb.scrollBy({ left: dir * Math.max(240, tb.clientWidth * 0.6), behavior: 'smooth' })); ['pointerdown', 'dblclick'].forEach((ev) => b.addEventListener(ev, (e) => e.stopPropagation())); host.appendChild(b); return b; };
    const L = mk('tbL', -1, '‹'), R = mk('tbR', 1, '›');
    const horiz = () => getComputedStyle(tb).flexDirection.indexOf('column') < 0 && getComputedStyle(tb).display !== 'none';
    const place = () => {
      if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
      const ok = horiz() && tb.scrollWidth > tb.clientWidth + 4, hb = host.getBoundingClientRect(), tr = tb.getBoundingClientRect();
      const canL = ok && tb.scrollLeft > 4, canR = ok && tb.scrollLeft + tb.clientWidth < tb.scrollWidth - 4;
      [[L, canL, tr.left - hb.left], [R, canR, tr.right - hb.left - 24]].forEach(([b, on, x]) => { b.style.display = on ? 'grid' : 'none'; b.style.left = x + 'px'; b.style.top = (tr.top - hb.top) + 'px'; b.style.height = tr.height + 'px'; });
    };
    tb.addEventListener('scroll', place, { passive: true });
    tb.addEventListener('wheel', (e) => { if (!horiz() || tb.scrollWidth <= tb.clientWidth + 4) return; const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY; if (!d) return; e.preventDefault(); tb.scrollLeft += d; }, { passive: false });
    window.addEventListener('resize', place);
    try { new ResizeObserver(place).observe(tb); } catch (e) { /* ignore */ }
    new MutationObserver(() => setTimeout(place, 30)).observe(tb, { childList: true });
    new MutationObserver(() => setTimeout(place, 80)).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    place(); setTimeout(place, 600);
    window.AAKAR_TBSCROLL = { update: place };
  }
  if (document.readyState === 'complete') setTimeout(boot, 900); else window.addEventListener('load', () => setTimeout(boot, 900));
})();
