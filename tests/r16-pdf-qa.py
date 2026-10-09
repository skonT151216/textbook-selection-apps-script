"""Validate and render the isolated r16 browser-generated PDF outputs."""
from pathlib import Path
import os
import subprocess
from pypdf import PdfReader
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent.parent / 'tmp' / 'r16-qa'
files = sorted(root.glob('*.pdf'))
assert len(files) == 5, len(files)
total = 0
env = dict(os.environ)
fonts = root.parent / 'r15-qa' / 'fonts.conf'
if fonts.exists():
    env['FONTCONFIG_FILE'] = str(fonts.resolve())
for file in files:
    reader = PdfReader(file)
    expected = 5 if file.name.startswith('05') else 1
    assert len(reader.pages) == expected, (file.name, len(reader.pages))
    total += expected
    for index, page in enumerate(reader.pages):
        landscape = float(page.mediabox.width) > float(page.mediabox.height)
        assert landscape == (index < 3 if expected == 5 else file.name.startswith(('01', '02')))
    subprocess.run(['pdftoppm', '-scale-to', '1200', '-png', str(file), str(file.with_suffix(''))], check=True, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
images = sorted(root.glob('0[1-4]*-1.png'))
batch = sorted(root.glob('05-batch-*.png'))
assert len(images) == 4 and len(batch) == 5
for label, group in [('forms', images), ('batch', batch)]:
    canvas = Image.new('RGB', (1500, ((len(group) + 1) // 2) * 1100), '#e4e9ef')
    draw = ImageDraw.Draw(canvas)
    for index, file in enumerate(group):
        image = Image.open(file).convert('RGB')
        image.thumbnail((730, 1050))
        x, y = index % 2 * 750 + 10, index // 2 * 1100 + 30
        draw.text((x, y - 22), file.name, fill='black')
        canvas.paste(image, (x, y))
    canvas.save(root / ('qa-' + label + '.png'))
print('r16 PDF QA passed:', len(files), 'files,', total, 'pages; all pages rendered for visual inspection')
