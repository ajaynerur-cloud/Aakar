# Aakar 8.15.1 follow-up

1. package.json      -> replace the one in the repo root (only "version" changed: 8.9.0 -> 8.15.1).
                        The Windows installers are then named Aakar-Setup-8.15.1.exe / Aakar-Portable-8.15.1.exe.
                        Also copy your current index.html into the folder electron-builder packs (your "files" list has app/**/*).
2. CAM tab companions -> puts Features (hole recognition), Measure and Section on the CAM tab.
        python camtab_patch.py index.html          (needs Python 3, keeps index.html.bak, safe to run twice)
        optional:  --version 8.15.2   to relabel the build
   Files: camtab_patch.py + aakar-camtab.js must stay in the same folder.
   test_camtab.js (node test_camtab.js) and search_sim.js are the tests used.
