"""Independent check of the exported files (python stdlib only):  python tests/verify.py"""
import json, struct, zipfile, os, xml.etree.ElementTree as ET
here = os.path.dirname(__file__)

def vol(tris):
    v = 0.0
    for a, b, c in tris:
        v += (a[0]*(b[1]*c[2]-b[2]*c[1]) - a[1]*(b[0]*c[2]-b[2]*c[0]) + a[2]*(b[0]*c[1]-b[1]*c[0])) / 6
    return v

# ---- GLB
d = open(os.path.join(here, 'out_box.glb'), 'rb').read()
magic, ver, ln = struct.unpack_from('<III', d, 0); assert magic == 0x46546C67 and ver == 2 and ln == len(d)
jl, jt = struct.unpack_from('<II', d, 12); assert jt == 0x4E4F534A
js = json.loads(d[20:20+jl]); p = 20 + jl
bl, bt = struct.unpack_from('<II', d, p); assert bt == 0x004E4942; bin_ = d[p+8:p+8+bl]
assert js['buffers'][0]['byteLength'] <= bl and bl % 4 == 0
acc = js['accessors'][js['meshes'][0]['primitives'][0]['attributes']['POSITION']]
bv = js['bufferViews'][acc['bufferView']]
vals = struct.unpack_from('<%df' % (acc['count']*3), bin_, bv['byteOffset'])
pts = [vals[i:i+3] for i in range(0, len(vals), 3)]
for k in range(3):
    assert abs(min(p_[k] for p_ in pts) - acc['min'][k]) < 1e-9 and abs(max(p_[k] for p_ in pts) - acc['max'][k]) < 1e-9
tris = [pts[i:i+3] for i in range(0, len(pts), 3)]
print('GLB  triangles', len(tris), ' volume m3', round(vol(tris), 9), '(expected 6e-06: 10x20x30 mm, outward winding)')
assert abs(vol(tris) - 6e-6) < 1e-9
# Y-up, metres: box was 10 x 20 x 30 mm (X,Y,Z)  ->  X 0.01, Y(up) 0.03, Z 0.02
ext = [acc['max'][k]-acc['min'][k] for k in range(3)]; print('GLB  extents (m)', [round(e, 6) for e in ext]); assert [round(e, 6) for e in ext] == [0.01, 0.03, 0.02]
assert js['materials'][0]['pbrMetallicRoughness']['baseColorFactor'][:3] == [1, 0.5, 0.25]

# ---- 3MF
z = zipfile.ZipFile(os.path.join(here, 'out_box.3mf')); assert z.testzip() is None
print('3MF  parts', z.namelist())
ET.fromstring(z.read('[Content_Types].xml')); ET.fromstring(z.read('_rels/.rels'))
ns = {'m': 'http://schemas.microsoft.com/3dmanufacturing/core/2015/02'}
root = ET.fromstring(z.read('3D/3dmodel.model')); assert root.get('unit') == 'millimeter'
obj = root.find('.//m:object', ns); assert obj.get('name') == 'Box & <1>'
V = [(float(v.get('x')), float(v.get('y')), float(v.get('z'))) for v in obj.findall('.//m:vertex', ns)]
T = [(int(t.get('v1')), int(t.get('v2')), int(t.get('v3'))) for t in obj.findall('.//m:triangle', ns)]
assert max(max(t) for t in T) < len(V)
print('3MF  vertices', len(V), ' triangles', len(T), ' volume mm3', round(vol([[V[i] for i in t] for t in T]), 6))
assert abs(vol([[V[i] for i in t] for t in T]) - 6000) < 1e-6
assert root.find('.//m:base', ns).get('displaycolor') == '#FF8040FF'
print('OK')
