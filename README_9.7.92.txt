Aakar 9.7.92 - full-screen fix for the Windows EXE (+ yellow Tape, timeline marks)

Copy into your repo (Aakar-main), replacing files of the same name, then rebuild the EXE:
  app/index.html        the app (single file)
  app/tutorials/        short videos + posters (must sit next to index.html)
  main.js, preload.js   desktop shell: window opens normal-maximised (never full screen); Esc or F11 leaves full screen;
                        a strip with Exit full screen / Minimise / Close Aakar shows at the top edge whenever the window is full screen

If you are stuck in full screen right now (old build): press F11 or Esc, or Alt+F4 to close.
