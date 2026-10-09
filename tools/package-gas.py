"""Package only installation files, with portable UTF-8 Korean filenames."""
import argparse
import hashlib
import os
from pathlib import Path
import tempfile
from zipfile import ZIP_DEFLATED, ZipFile

FILES = (
    'Code.gs', 'Index.html', 'appsscript.json', 'README.md',
    '상세_실행_매뉴얼.md', '검증_결과.md', '처음_시작하기.html',
    '서식_1_2_3_가상예시.pdf', 'THIRD_PARTY_LICENSES.md',
)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    output = args.output.resolve()
    if output.suffix != '.zip':
        parser.error('output must be a .zip file')
    for name in FILES:
        if not (root / name).is_file():
            parser.error('missing installation file: ' + name)
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=output.parent, suffix='.zip', delete=False) as temp:
        temporary = Path(temp.name)
    try:
        with ZipFile(temporary, 'w', ZIP_DEFLATED, compresslevel=9) as archive:
            for name in FILES:
                archive.write(root / name, arcname=name)
        with ZipFile(temporary) as archive:
            assert archive.testzip() is None
            assert archive.namelist() == list(FILES)
            for info in archive.infolist():
                assert archive.read(info) == (root / info.filename).read_bytes()
                if not info.filename.isascii():
                    assert info.flag_bits & 0x800, 'Korean filename must have the UTF-8 flag'
        os.replace(temporary, output)
    finally:
        temporary.unlink(missing_ok=True)
    print('Verified', len(FILES), 'installation files:', output)
    print('SHA256:', hashlib.sha256(output.read_bytes()).hexdigest())


if __name__ == '__main__':
    main()
