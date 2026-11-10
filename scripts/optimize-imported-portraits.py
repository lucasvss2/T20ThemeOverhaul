"""Encode bundled portraits losslessly; keep source bytes in the local build cache."""
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from PIL import Image

workspace = Path(__file__).resolve().parents[1]
assets = (workspace / 'public/assets/criaturas-integradas').resolve()
cache = (workspace / 'node_modules/.cache/servos-importacao/original-images').resolve()
assert assets.is_relative_to(workspace) and cache.is_relative_to(workspace)
cache.mkdir(parents=True, exist_ok=True)
mapping_file = workspace / 'scripts/data/imported-creature-assets.json'
mapping = json.loads(mapping_file.read_text(encoding='utf-8'))
files = sorted({(workspace / 'public' / value['path'].removeprefix('modules/t20-theme-overhaul/')).resolve()
                for value in mapping.values() if not value['path'].endswith('.svg')})

def encode(source):
    assert source.parent == assets
    if source.suffix == '.webp':
        return None
    with Image.open(source) as img:
        if getattr(img, 'n_frames', 1) > 1:
            return None
        rgba = img.convert('RGBA')
        target = source.with_suffix('.webp')
        rgba.save(target, 'WEBP', lossless=True, exact=True, method=4)
        with Image.open(target) as result:
            assert result.convert('RGBA').tobytes() == rgba.tobytes(), source.name
    if target.stat().st_size >= source.stat().st_size:
        target.unlink()
        return None
    saved = source.stat().st_size - target.stat().st_size
    (cache / source.name).write_bytes(source.read_bytes())
    source.unlink()
    return (source.name, target.name, saved)

with ThreadPoolExecutor(max_workers=4) as pool:
    results = [result for result in pool.map(encode, files) if result]
by_name = {old: new for old, new, _ in results}
for value in mapping.values():
    old = Path(value['path']).name
    if old in by_name:
        value['path'] = value['path'].rsplit('/', 1)[0] + '/' + by_name[old]
mapping_file.write_text(json.dumps(mapping, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'converted': len(results), 'savedMB': round(sum(saved for _, _, saved in results) / 1048576, 1)}))
