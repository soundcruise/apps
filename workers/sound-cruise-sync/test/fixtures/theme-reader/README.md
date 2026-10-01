Sync adapters of the theme reader-first release (Pitch 2.26.3, Fretboard 2.21.3, Rhythm 1.16.3; commit 62b2b4ac).
They accept a settings theme but do not declare `settings_theme_v1`, so after the writer release they are
"old" clients too. Used only by test/theme-writer-compat.test.js (loaded as text; the .fixture extension
keeps `node --test` from running them). Do not edit.
