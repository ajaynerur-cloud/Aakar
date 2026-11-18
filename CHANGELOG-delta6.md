# delta6
- Convert › Face to NURBS: planes (outline and holes kept as trims) and cylinders become exact NURBS surfaces.
- Intersection curve between two NURBS surfaces is now refined on both surfaces (Newton), instead of a mesh approximation.
- Imported STEP solids keep their STEP text, so Direct+ edits them exactly (kernel re-reads the file; volume-checked).
- Offset face and Move hole/boss show their drag handle on the picked face (live preview); Move hole/boss gets a "keep aligned" lock.
- Kernel: built-in ear-clipping fallback (runs without a host triangulator, e.g. AakarKernel.exe); direct editing tolerates STEP-rounded coordinates.
- AakarKernel.exe self-test also checks direct edits and a STEP round trip; the app has `--smoke-test`.
- New workflow windows-verify.yml: kernel tests on Windows, kernel.exe self-test, app smoke test from source and from the silently installed NSIS build.
- 4th Cross-model lesson (Face to NURBS).
