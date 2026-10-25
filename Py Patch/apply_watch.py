#!/usr/bin/env python3
"""Adds Watch mode to an Aakar 8.17.x single-file HTML (the Tutorial Studio must already be in it).

    python apply_watch.py index.html                 -> writes index_watch.html next to it
    python apply_watch.py index.html out.html        -> writes out.html
    python apply_watch.py index.html out.html 8.17.2 8.18.0   -> also relabels the visible version

aakar-tutorial-watch.js must be in the same folder as this script.  Safe to run on an already patched file (it refuses).
"""
import os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__)); a = sys.argv[1:]
if not a: sys.exit(__doc__)
src = a[0]; dst = a[1] if len(a) > 1 else os.path.splitext(src)[0] + '_watch.html'
h = open(src, encoding='utf-8').read(); js = open(os.path.join(HERE, 'aakar-tutorial-watch.js'), encoding='utf-8').read()
if 'id="aakar-tutorial-watch"' in h: sys.exit('Already patched: this file already contains Watch mode.')
if '</script' in js.lower(): sys.exit('module contains a closing script tag')
HOOK = "await sleep(40); var r = await runStep(c, i, { pace: 0 }); PL.busy = false;"
NEW = ("await sleep(40); if (window.AAKAR_WATCH && window.AAKAR_WATCH.enabled()) { try { await window.AAKAR_WATCH.play(c, i); } catch (we) { try { window.AAKAR_WATCH.stop(); } catch (we2) { /* ignore */ } } }\n"
       "    var r = await runStep(c, i, { pace: 0 }); PL.busy = false;")
if h.count(HOOK) != 1: sys.exit('This does not look like an Aakar file with the Tutorial Studio (build hook not found exactly once).')
if 'window.AAKAR_TUTORIALS' not in h: sys.exit('No Tutorial Studio found.')
h = h.replace(HOOK, NEW)
i = h.rfind('</body>')
if i < 0: sys.exit('No </body> found.')
h = h[:i] + '\n<!--AAKAR-TUTORIAL-WATCH-START-->\n<script id="aakar-tutorial-watch">\n' + js.rstrip() + '\n</script>\n<!--AAKAR-TUTORIAL-WATCH-END-->\n' + h[i:]
if len(a) >= 4: n = h.count(a[2]); h = h.replace(a[2], a[3]); print('relabelled %d occurrence(s) %s -> %s' % (n, a[2], a[3]))
open(dst, 'w', encoding='utf-8').write(h); print('Wrote', dst, '(%.2f MB)' % (len(h.encode('utf-8')) / 1048576))
