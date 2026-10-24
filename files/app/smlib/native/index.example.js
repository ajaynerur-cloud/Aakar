// Template for app/smlib/native/index.js: the SMLib engine for the DESKTOP app, run in Electron's main process (see ../README.md).
// Copy this file to index.js and replace the require() below with YOUR N-API addon compiled against your licensed SMLib.
// Aakar calls these functions synchronously over IPC; shapes stay here, the page only sees handles.
'use strict';
const path = require('path');

exports.name = 'SMLib';
exports.version = '';

/** called once when the user picks Engine ▸ SMLib. May return a Promise. Must return an object with the calls below. */
exports.init = function init(opts) {
  // const addon = require(path.join(opts.dir, 'build', 'Release', 'aakar_smlib.node'));   // <- your compiled addon
  const addon = null;
  if (!addon) throw new Error('index.example.js is a template: build the SMLib addon and load it in app/smlib/native/index.js');
  exports.version = addon.version ? addon.version() : '';
  return {
    // primitives — Aakar's placement convention: box corner at the origin; cylinder / cone base centred on the origin, axis +Z; sphere / torus centred
    box: (w, d, h) => addon.box(w, d, h),
    cylinder: (r, h) => addon.cylinder(r, h),
    sphere: (r) => addon.sphere(r),
    translate: (s, v) => addon.translate(s, v[0], v[1], v[2]),
    // booleans (return new shapes; inputs stay valid)
    fuse: (a, b) => addon.fuse(a, b), cut: (a, b) => addon.cut(a, b), common: (a, b) => addon.common(a, b),
    // measurements
    volume: (s) => addon.volume(s), area: (s) => addon.area(s),
    // triangles for display: { positions: Float32Array (xyz…), indices: Uint32Array } — tol = chordal tolerance in mm
    mesh: (s, tol) => addon.mesh(s, tol),
    // ISO 10303-21 text with exact geometry (CYLINDRICAL_SURFACE etc.)
    stepExport: (s) => addon.stepExport(s),
    // optional: stepImport(text), cone(r1, r2, h), torus(R, r), rotate(s, origin, axis, radians), scale(s, f), bbox(s) -> { min, max },
    //           massProps(s) -> { volume, area, centroid: [x,y,z], inertia: [[...]] }, info(s), validate(s) -> { ok, issues }, release(s)
    release: (s) => addon.release && addon.release(s)
  };
};
