"""Developer-only download/rebuild. Runtime uses only the bundled same-origin JS.

python3 apps/cruise-studio/scripts/build-piano-bank.py
Samples: Alexander Holm, Salamander Grand Piano, CC BY 3.0 (see vendor/piano).
"""
import base64
import concurrent.futures
import hashlib
import json
import pathlib
import urllib.request

SOURCE_COMMIT = '869b6f8d9cddb47d966238c012041480b1ce517a'
BASE = f'https://raw.githubusercontent.com/Tonejs/audio/{SOURCE_COMMIT}/salamander/'
OUT = pathlib.Path(__file__).resolve().parents[1] / 'vendor/piano'
NOTES = [(21, 'A0')] + [(12 * (octave + 1) + pc, name + str(octave))
    for octave in range(1, 8) for pc, name in [(0, 'C'), (3, 'Ds'), (6, 'Fs'), (9, 'A')]] + [(108, 'C8')]

def download(item):
    midi, name = item
    with urllib.request.urlopen(BASE + name + '.mp3', timeout=30) as response:
        data = response.read()
    return {'midi': midi, 'name': name, 'sha256': hashlib.sha256(data).hexdigest(),
            'bytes': len(data), 'mp3': base64.b64encode(data).decode('ascii')}

if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        samples = list(pool.map(download, NOTES))
    metadata = {'author': 'Alexander Holm', 'instrument': 'Salamander Grand Piano / Yamaha C5',
                'license': 'CC BY 3.0', 'sourceCommit': SOURCE_COMMIT}
    bank = {**metadata, 'samples': samples}
    (OUT / 'salamander-bank.js').write_text(
        '/* Alexander Holm — Salamander Grand Piano. CC BY 3.0. See NOTICE.md.\n'
        ' * Original MP3 bytes, base64 wrapped; nearby notes are repitched at playback. */\n'
        '(function(){"use strict";window.CruiseStudio.pianoSamples=Object.freeze(' +
        json.dumps(bank, ensure_ascii=False, separators=(',', ':')) + ');})();\n')
    (OUT / 'manifest.json').write_text(json.dumps({**metadata, 'samples': [
        {k: v for k, v in sample.items() if k != 'mp3'} for sample in samples]}, indent=2) + '\n')
    with urllib.request.urlopen(BASE + 'README', timeout=30) as response:
        (OUT / 'UPSTREAM-README.txt').write_bytes(response.read())
    print(f'Bundled {len(samples)} samples, {sum(s["bytes"] for s in samples)} MP3 bytes')
