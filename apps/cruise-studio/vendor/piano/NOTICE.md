# Salamander Grand Piano samples

Recorded by **Alexander Holm**, Salamander Grand Piano / Yamaha C5.
Licensed under [Creative Commons Attribution 3.0 Unported](https://creativecommons.org/licenses/by/3.0/).
Original author/license notice: [UPSTREAM-README.txt](UPSTREAM-README.txt).
License text: https://creativecommons.org/licenses/by/3.0/legalcode

MP3 distribution: https://github.com/Tonejs/audio/tree/869b6f8d9cddb47d966238c012041480b1ce517a/salamander

Thirty MP3 files are copied without changing their bytes and wrapped in base64
inside salamander-bank.js. manifest.json records the source commit and checksums.
The player selects a nearby recorded pitch, adjusts playback rate, gain, and a
short release envelope. No Tone.js runtime is included. No author endorsement is
implied. These samples retain their CC BY 3.0 license separately from this
repository's proprietary code. Keep this notice with the sample bank.

The current local development candidate loads this bank from the same origin.
It is not added to the public package allowlist in this change.
