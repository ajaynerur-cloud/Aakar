#!/usr/bin/env python3
"""Reads the STEP files of the freeform solids with a REAL OpenCascade (pip install cadquery-ocp) and compares validity, volume and area with AakarKernel.
   python3 kernel/test/occt_crosscheck.py      (exit code 0 = all valid and within 1e-5)"""
import json, os, subprocess, sys, tempfile
here = os.path.dirname(os.path.abspath(__file__)); out = tempfile.mkdtemp(prefix='aakar_step_')
try:
    from OCP.STEPControl import STEPControl_Reader
    from OCP.IFSelect import IFSelect_RetDone
    from OCP.BRepCheck import BRepCheck_Analyzer
    from OCP.GProp import GProp_GProps
    from OCP.BRepGProp import BRepGProp
except Exception as e:
    print('SKIP: OCP (pip install cadquery-ocp) not available:', e); sys.exit(0)
subprocess.check_call(['node', os.path.join(here, 'occt_cases.js'), out])
meta = json.load(open(os.path.join(out, 'meta.json'))); bad = 0
for k, m in sorted(meta.items()):
    r = STEPControl_Reader()
    if r.ReadFile(os.path.join(out, k + '.step')) != IFSelect_RetDone: print('FAIL', k, 'cannot be read'); bad += 1; continue
    r.TransferRoots(); sh = r.OneShape(); ok = BRepCheck_Analyzer(sh).IsValid()
    p = GProp_GProps(); BRepGProp.VolumeProperties_s(sh, p, 1e-9, False, False); a = GProp_GProps(); BRepGProp.SurfaceProperties_s(sh, a, 1e-9, False)
    dv = abs(p.Mass() - m['vol']) / abs(m['vol']); da = abs(a.Mass() - m['area']) / abs(m['area']); good = ok and dv < 1e-5 and da < 1e-5
    print(('ok   ' if good else 'FAIL ') + k + '  valid=%s  volume diff %.1e  area diff %.1e' % (ok, dv, da)); bad += 0 if good else 1
print('%d solids cross-checked against OpenCascade, %d failed' % (len(meta), bad)); sys.exit(1 if bad else 0)
