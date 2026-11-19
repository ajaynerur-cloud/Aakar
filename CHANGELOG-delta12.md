# delta12: kernel not recognised after install

Cause: the app looks for the installable kernel at kernel/aakar-kernel.installable.js NEXT TO index.html (app/kernel/...). The earlier deltas put the kernel at Aakar-main/kernel/dist/ only, so the app reported "folder kernel/ not found" and kept the built-in one. The built-in kernel also still reported 1.4.0 while the installable one says 1.5.0.

Fix
- app/kernel/aakar-kernel.installable.js is now included (the place the app expects).
- The app now also searches kernel/dist/, ../kernel/ and ../kernel/dist/ (so the repository layout Aakar-main/app + Aakar-main/kernel/dist works too).
- Built-in and installable kernel both report 1.5.0 (one version).
- Full kernel/ folder (src, dist, tests) included; kernel tests: all suites pass.

Check: open Exact kernel panel (status bar chip "AakarKernel") > Check. It should say the installed kernel is found (1.5.0, same as built-in).
