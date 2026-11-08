# Aakar 9.7.79 - what changed and how to build

## Files to drop into the repo (same paths)
- app/index.html                       the app (9.7.79)
- .github/workflows/build-windows.yml  EXE build, now survives GitHub 504 timeouts
- .github/workflows/build-android.yml  NEW: APK build
- mobile/package.json, mobile/prepare.js, mobile/.gitignore   NEW: Android wrapper (Capacitor)
- .npmrc                                npm retries

## EXE failure (504 Gateway Time-out)
`npm ci` runs electron's install.js, which downloads the Electron binary from github.com. GitHub answered 504, so the job died.
The workflow now: installs packages with --ignore-scripts, downloads the Electron binary with 6 tries (last 3 via the npmmirror mirror),
caches the Electron / electron-builder downloads between runs, and retries electron-builder up to 3 times.
If a run still fails, press "Re-run failed jobs": the cache makes the next run skip the download.

## APK
Push to main (or Actions > Build Aakar Android APK > Run workflow). Download "Aakar-android-apk" from the run. app-debug.apk installs on any
Android phone or tablet (allow "install unknown apps"). For a signed release APK add secrets ANDROID_KEYSTORE_BASE64,
ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD.
Local build: cd mobile && npm install && node prepare.js && cd android && ./gradlew assembleDebug
Not run end to end here (no Android SDK in my sandbox): the project generation, manifest and version patches were run and checked; the Gradle step was not.
Check on the device: the exact-kernel (OCCT .mjs/.wasm) modules; if they do not load, the app keeps the built-in kernel.

## Tablet and pen
Checked at 1280x800 and 800x1280 with touch, finger and pen input.
Already worked: one-finger orbit, two-finger pan/zoom in 3D, long press = right click in 3D, palm rejection while the pen is near, pen drawing.
Fixed in 9.7.79:
- Sketcher: two fingers pinch-zoom and pan the sketch (before, a second finger did nothing).
- Sketcher: long press (Select tool) opens the right-click menu (before, touch had no way to open it).
- Bigger touch targets: tree check-boxes, group bar, group and Dimensions panel, profile tables, View panel, selection dock (44 px rows, 24 px check-boxes).
- Every small button that touch mode did not cover gets an invisible larger tap area.
Known: some ribbon buttons are still visually 22-26 px tall (the tap area is larger); portrait width under 900 px collapses side panels, use the panel buttons.
