# PDF.js 6.5.438

Pinned upstream distribution: https://registry.npmjs.org/pdfjs-dist/-/pdfjs-dist-6.5.438.tgz

npm tarball integrity (verified before use):

```
sha512-vg8Pw1x+AFKy4AMDvhuWl5cOYV8d698UoEANoFFhc79hqXDnZQqnOXoxw3HG907WHOg1JYOvLhP756boddFxpA==
```

Sources: [official project](https://github.com/mozilla/pdf.js), [API documentation](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html), [security advisories](https://github.com/mozilla/pdf.js/security/advisories).

Unmodified `legacy/build/pdf.min.mjs` and matching parser `pdf.worker.min.mjs`, CMaps, standard fonts, image/color assets and their licenses are included. No generic viewer, sandbox, QuickJS evaluation assets, annotation UI or scripting manager is installed. `SHA256.json` records the copied upstream files (excluding this local note). Package metadata is retained for provenance; no npm lifecycle scripts are run.

The viewer supplies local bytes, fixed same-origin asset URLs, strict parse errors, no XFA, no scripting/annotation layer, and main-thread canvas rendering with bounded canvases. `useWasm:false` selects bundled JavaScript image fallbacks; parser runs in a dedicated Worker. The local development server permits connections only into this asset directory and only this parser Worker. It does not allow Account/Sync APIs, external PDF URLs or remote font/CDN downloads.

Apache-2.0 applies to PDF.js (`LICENSE`). CMaps, fonts and image/color components retain their own adjacent license files. These files are third-party distribution assets, not Sound Cruise proprietary source.
