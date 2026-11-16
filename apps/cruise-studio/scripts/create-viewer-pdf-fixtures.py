# -*- coding: utf-8 -*-
"""Synthetic test PDFs only. Run with the bundled reportlab/pypdf runtime."""
from pathlib import Path
from io import BytesIO
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from PIL import Image, ImageDraw
from pypdf import PdfReader, PdfWriter
from pypdf.generic import EncodedStreamObject, NameObject

out = Path(__file__).resolve().parents[1] / 'tests/fixtures/viewer-pdf'
out.mkdir(parents=True, exist_ok=True)
pdfmetrics.registerFont(UnicodeCIDFont('HeiseiKakuGo-W5'))

def page(c, number):
    c.setFillColorRGB(1, 1, 1); c.rect(0, 0, 595, 842, fill=1, stroke=0)
    c.setFillColorRGB(.1, .16, .2); c.setFont('Helvetica-Bold', 24)
    c.drawString(36, 790, 'Cruise Viewer - PDF test')
    c.setFont('Helvetica', 16); c.drawString(36, 758, 'Page %s | C  G  Am  F' % number)
    c.setFont('HeiseiKakuGo-W5', 12); c.drawString(36, 735, '譜面ビューワー 表示テスト')
    for row in range(8):
        y = 700-row*74
        c.setStrokeColorRGB(.65, .65, .65)
        for line in range(5): c.line(36, y-line*6, 555, y-line*6)
        c.setFillColorRGB(.78, .15, .12); c.setFont('Helvetica-Bold', 16)
        c.drawString(42, y+12, ['C', 'G', 'Am', 'F'][row % 4])
        c.setFillColorRGB(.1, .1, .1); c.setFont('Helvetica', 12)
        c.drawString(42, y-42, 'Original synthetic score for visual verification')
    c.setFont('Helvetica', 12); c.drawString(36, 24, 'PAGE %s - END MARK' % number)

buf=BytesIO(); c=canvas.Canvas(buf, pagesize=(595,842), invariant=1)
for n in range(1,4): page(c,n); c.showPage()
c.save(); reader=PdfReader(BytesIO(buf.getvalue())); writer=PdfWriter(); writer.append(reader)
writer.pages[1].rotate(90)
# These actions/links must never be installed by the canvas-only viewer.
writer.add_js('globalThis.__pdfExecuted = true;')
with (out/'mixed.pdf').open('wb') as f: writer.write(f)

image=Image.new('RGB',(900,1280),'white'); draw=ImageDraw.Draw(image)
for y in range(80,1220,95):
    for line in range(5): draw.line((40,y+line*9,860,y+line*9),fill='black',width=2)
    for x in range(100,840,110): draw.ellipse((x,y-5,x+15,y+5),fill='black')
draw.text((40,20),'SCANNED SYNTHETIC SCORE',fill='black')
c=canvas.Canvas(str(out/'scan.pdf'),pagesize=(595,842),invariant=1)
for n in range(2): c.drawImage(ImageReader(image),0,0,595,842); c.showPage()
c.save()

for count,name in [(200,'long-200.pdf'),(201,'over-201.pdf')]:
    c=canvas.Canvas(str(out/name),pagesize=(595,842),invariant=1)
    for n in range(1,count+1): page(c,n); c.showPage()
    c.save()

writer=PdfWriter(); writer.append(reader); writer.encrypt('test-password')
with (out/'encrypted.pdf').open('wb') as f: writer.write(f)
writer=PdfWriter(); writer.append(reader)
stream=EncodedStreamObject(); stream._data=b'not a valid flate stream'; stream[NameObject('/Filter')]=NameObject('/FlateDecode')
writer.pages[2][NameObject('/Contents')]=writer._add_object(stream)
with (out/'broken-page.pdf').open('wb') as f: writer.write(f)
