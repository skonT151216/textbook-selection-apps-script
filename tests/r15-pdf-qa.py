"""Read-only logical QA and rendered contact sheets for the isolated browser PDFs."""
from pathlib import Path
import re
from pypdf import PdfReader
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent.parent / 'tmp' / 'r15-qa'
files = sorted(root.glob('*.pdf'))
assert len(files) == 12, len(files)
total = 0
for file in files:
    pdf = PdfReader(file)
    expected = 6 if file.name.startswith(('05', '06')) else 1
    assert len(pdf.pages) == expected, (file.name, len(pdf.pages))
    total += len(pdf.pages)
    text = '\n'.join(page.extract_text() or '' for page in pdf.pages)
    compact = re.sub(r'\s+', '', text)  # Skia PDFs can place spacing between Hangul syllables.
    assert not re.search(r'teacher_[0-9a-f]+', text), file.name
    if '-print' in file.name and not file.name.startswith('01'):
        assert '김교사' in compact, file.name
        if 'kim1' in file.name:
            assert 'kim1교사의독립적인추천의견입니다.' in compact
            assert 'kim2교사의독립적인추천의견입니다.' not in compact
        if 'kim2' in file.name:
            assert 'kim2교사의독립적인추천의견입니다.' in compact
            assert 'kim1교사의독립적인추천의견입니다.' not in compact
    for i, page in enumerate(pdf.pages):
        landscape = float(page.mediabox.width) > float(page.mediabox.height)
        assert landscape == (i < 4 if expected == 6 else file.name.startswith(('01', '02'))), (file.name, i)

# QA thumbnails are diagnostics only; original renders remain next to each PDF.
groups = [
    sorted(root.glob('*-app-1.png')),
    sorted(root.glob('*-print-1.png')),
    sorted(root.glob('05-batch-submission-*.png')),
    sorted(root.glob('06-virtual-example-*.png')),
]
for group, images in enumerate(groups):
    assert images
    canvas = Image.new('RGB', (1200, ((len(images) + 1) // 2) * 860), '#dde3ea')
    draw = ImageDraw.Draw(canvas)
    for index, file in enumerate(images):
        im = Image.open(file).convert('RGB')
        im.thumbnail((580, 820))
        x, y = (index % 2) * 600 + 10, (index // 2) * 860 + 25
        draw.text((x, y - 20), file.name, fill='black')
        canvas.paste(im, (x, y))
    canvas.save(root / ('qa-contact-' + str(group) + '.png'))
print('r15 PDF QA passed:', len(files), 'files,', total, 'pages, real names, independent opinions and orientations verified')
