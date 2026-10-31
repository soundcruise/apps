# Pro tool acceptance, isolated Chrome

Base #120, 50edf61724b05224f6ae53a30d45416a082c39f9. Test environment uses the repository's loopback synthetic authority server and disposable Chromium contexts; no real credentials or user data.

- Tuner: source DOM/controller, auto fake microphone, input level, six string buttons, reference help, capo storage/reload and navigation stop covered. Audible reference quality, real pitch/note/cent accuracy, denial/retry and physical microphones remain open.
- Metronome: source DOM/controller, 3/4 and BPM changes, rhythm and sound changes during playback, preset create/reload/delete and Global Stop covered. Accent permutations, volume persistence, timing measurements, preset edit and audio quality remain open.
- Practice/calendar: CRUD, order, six menus, presets, timer/history/calendar, unsaved confirmation and Global Stop covered in synthetic data. Attachment formats, timer edge cases and all input methods remain open.
- Gear/My Apps: CRUD, order, categories/size, six My Apps, synthetic PNG crop/re-edit/removal with binary cleanup, preset and synthetic URL covered. Other image types, all ownership transitions and platform URL variants remain open.
- Five tool routes rendered without horizontal overflow at 1440/1024/768/390 pixels in a 900px-high viewport. Existing five-theme regression also passed; this is not a complete contrast, keyboard, IME, hover or touch audit.

Studio Node: 1931 pass, 2 dedicated Cloud tests skipped. Existing focused Studio Browser: 19 pass. New product controls and width tests: 2 pass. Port standalone Pro pixel-by-pixel comparison was not performed. Safari, phone, real Pro/Account, two-device Sync and real audio remain unaccepted. #107 writer P2 remains HOLD. No production code changed in this acceptance increment.
