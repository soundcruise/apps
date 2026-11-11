"""Developer-only download/rebuild. Runtime uses only the bundled same-origin JS.

python3 apps/cruise-studio/scripts/build-guitar-bank.py
Samples: Iowa / N. P. Brosowsky, tonejs-instruments, CC BY 3.0 (see vendor/guitar).
"""
import base64
import concurrent.futures
import hashlib
import json
import pathlib
import urllib.request

SOURCE_COMMIT = '622c2f1c32c8cfce4158ddc3eb26e518ddef37e5'
BASE = f'https://raw.githubusercontent.com/nbrosowsky/tonejs-instruments/{SOURCE_COMMIT}/samples/guitar-acoustic/'
OUT = pathlib.Path(__file__).resolve().parents[1] / 'vendor/guitar'
NOTES = [(40,'E2'),(43,'G2'),(46,'As2'),(49,'Cs3'),(52,'E3'),(55,'G3'),(58,'As3'),(61,'Cs4'),(64,'E4'),(67,'G4'),(70,'As4'),(73,'Cs5'),(74,'D5')]

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
    metadata = {'author': 'University of Iowa Electronic Music Studios / N. P. Brosowsky', 'instrument': 'tonejs-instruments acoustic guitar',
                'license': 'CC BY 3.0', 'sourceCommit': SOURCE_COMMIT}
    bank = {**metadata, 'samples': samples}
    (OUT / 'acoustic-bank.js').write_text(
        '/* Iowa / N. P. Brosowsky — acoustic guitar. CC BY 3.0. See NOTICE.md.\n'
        ' * Original MP3 bytes, base64 wrapped; nearby notes are repitched at playback. */\n'
        '(function(){"use strict";window.CruiseStudio.guitarSamples=Object.freeze(' +
        json.dumps(bank, ensure_ascii=False, separators=(',', ':')) + ');})();\n')
    (OUT / 'manifest.json').write_text(json.dumps({**metadata, 'samples': [
        {k: v for k, v in sample.items() if k != 'mp3'} for sample in samples]}, indent=2) + '\n')
    upstream = f'https://raw.githubusercontent.com/nbrosowsky/tonejs-instruments/{SOURCE_COMMIT}/'
    for name in ['README.md', 'sample-source-info.txt']:
        with urllib.request.urlopen(upstream + name, timeout=30) as response:
            (OUT / ('UPSTREAM-' + name)).write_bytes(response.read())
    print(f'Bundled {len(samples)} samples, {sum(s["bytes"] for s in samples)} MP3 bytes')
