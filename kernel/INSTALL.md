# Installable AakarKernel

`app/index.html` always carries a complete built-in kernel, so it works as a single file. The *installable* kernel is an optional newer build:

- `node kernel/build.js` writes `kernel/dist/aakar-kernel.installable.js` (sets `window.AakarKernelInstalled`, never touches the built-in `window.AakarKernel`).
- The GitHub workflow `build-windows.yml` builds it, runs the kernel tests, copies it to `app/kernel/` and so ships it inside the exe.
- At start-up the app looks for `kernel/aakar-kernel.installable.js` next to `index.html`. Not found: it silently keeps the built-in kernel. Found and newer: it uses it automatically (Exact kernel panel: Check / Use installed / Use built-in; the choice is remembered).
- With the plain html file you can use it too: put the folder `kernel/` with that one file beside the html.
- After changing `kernel/src`, refresh the html with `node kernel/sync.js app/index.html` (CI checks that they match).
