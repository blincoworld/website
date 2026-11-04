#!/usr/bin/env python3
"""Create a review-only static bundle. This does not deploy or replace the CMS."""
import json
import shutil
from pathlib import Path

root = Path(__file__).resolve().parent.parent
output = root / 'dist'
files = json.loads((root / 'production-files.json').read_text())
if output.exists(): shutil.rmtree(output)
for name in files:
    source = root / name
    if source.is_symlink() or not source.resolve().is_relative_to(root) or not source.is_file():
        raise ValueError(f'Invalid production file: {name}')
    if source.stat().st_size > 25 * 1024 * 1024:
        raise ValueError(f'File exceeds 25 MiB: {name}')
    target = output / name
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)
print(f'Review bundle: {len(files)} files, {sum((output / f).stat().st_size for f in files):,} bytes')
