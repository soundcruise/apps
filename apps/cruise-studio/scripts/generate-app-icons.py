"""Reproducible whole-image reduction of approved PNGs; no crop, mask or recolor.
Requires Pillow. Standard artwork is intentionally never generated for release.
"""
from pathlib import Path
import hashlib,json
from PIL import Image
root=Path(__file__).resolve().parent.parent
source=root/'icon-sources/pro/source.png'
metadata=json.loads((source.parent/'source.json').read_text())
assert hashlib.sha256(source.read_bytes()).hexdigest()==metadata['sha256']
output=root/'assets/app-icons/pro';output.mkdir(parents=True,exist_ok=True)
with Image.open(source) as image:
    assert image.format=='PNG' and image.size[0]==image.size[1]
    for name,size in [('favicon-32',32),('apple-touch-icon-180',180),('icon-192',192),('icon-512',512),('icon-1024',1024)]:
        image.resize((size,size),Image.Resampling.LANCZOS).save(output/(name+'.png'),format='PNG',optimize=True)
        print(output/(name+'.png'))
