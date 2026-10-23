AakarKernel 1.0 wired into Aakar (baseline: your Aakar_8.10.0.html)

ADD / REPLACE in the repo:
  app/index.html                          <- Aakar 8.11.0 (8.10.0 + AakarKernel, wired)
  kernel/                                 <- kernel source, build, embed script, tests, README
  .github/workflows/kernel-tests.yml      <- runs the kernel tests on every push

Nothing else changes (main.js, package.json, preload.js, existing workflow stay as they are).
To rebuild the html from your own 8.10.0 file:   node kernel/embed.js in.html out.html 8.11.0
