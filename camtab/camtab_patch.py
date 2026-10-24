#!/usr/bin/env python3
"""Adds the CAM-tab companions (Features, Measure, Section) to an Aakar 8.15.x single-file HTML.

    python camtab_patch.py index.html                  -> index.html (patched in place, backup index.html.bak)
    python camtab_patch.py index.html out.html         -> out.html
    python camtab_patch.py index.html --version 8.15.2 -> also relabels 8.15.1 -> 8.15.2 (title, brand, headers)

Safe to run twice (the block is replaced, never duplicated). Refuses to touch a file that does not look like Aakar 8.15.x."""
import os, re, shutil, sys

HERE = os.path.dirname(os.path.abspath(__file__))
args = [a for a in sys.argv[1:] if not a.startswith('--')]
ver = None
if '--version' in sys.argv:
    i = sys.argv.index('--version'); ver = sys.argv[i + 1]; args = [a for a in args if a != ver]
if not args:
    sys.exit(__doc__)
src = args[0]; dst = args[1] if len(args) > 1 else src
html = open(src, encoding='utf-8').read()
mod = open(os.path.join(HERE, 'aakar-camtab.js'), encoding='utf-8').read()

# sanity: this must be the 8.15.x file with a CAM tab
checks = {
    'Aakar 8.15': 'Aakar 8.15' in html,
    "CAM group (P.addGroup('cam', 'CAM'": "P.addGroup('cam', 'CAM'" in html,
    'x855js anchor (exactly once)': html.count('<script id="x855js">') == 1,
}
bad = [k for k, v in checks.items() if not v]
if bad:
    sys.exit('Not patched - this does not look like Aakar 8.15.x with a CAM tab. Missing: ' + ', '.join(bad))

START, END = '<!--AAKAR-CAMTAB-START-->', '<!--AAKAR-CAMTAB-END-->'
had = START in html
html = re.sub(r'\n?' + re.escape(START) + r'.*?' + re.escape(END) + r'\n?', '\n', html, flags=re.S)
if '</script' in mod.lower():
    sys.exit('module contains a closing script tag')
block = START + '\n<script id="aakar-camtab">\n' + mod.rstrip() + '\n</script>\n' + END + '\n'
html = html.replace('<script id="x855js">', block + '<script id="x855js">', 1)
if ver:
    n = html.count('8.15.1'); html = html.replace('8.15.1', ver); print('relabelled %d occurrence(s) 8.15.1 -> %s' % (n, ver))
if dst == src and not os.path.exists(src + '.bak'):
    shutil.copyfile(src, src + '.bak')
open(dst, 'w', encoding='utf-8').write(html)
print(('Replaced the existing block. ' if had else '') + 'Wrote ' + dst + ' (%.2f MB)' % (len(html.encode('utf-8')) / 1048576))
