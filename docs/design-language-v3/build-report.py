"""Package static design boards while keeping runtime evidence distinct."""
from pathlib import Path
import base64
import hashlib
import html
import json
import re
import zipfile

root = Path(__file__).resolve().parent
repo = root.parent.parent
boards = ['00-before-after', '01-brand-components', '02-first-checkpoint', '03-six-screens', '04-forms', '05-states-dark']
labels = ['前后对照 / Compare', '品牌组件 / Brand', '三屏 / Checkpoint', '六屏 / Screens', '表单 / Forms', '状态深色 / States']
native = Path('/tmp/leanon-ui-review-20261005/leanon-final-native-overview.png')
tokens = json.loads((root / 'tokens.json').read_text())

def image_data(file):
    return 'data:image/png;base64,' + base64.b64encode(file.read_bytes()).decode()

def inline(text):
    text = html.escape(text)
    text = re.sub(r'`([^`]+)`', r'<code>\1</code>', text)
    text = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', text)
    return re.sub(r'\[([^]]+)\]\(([^)]+)\)', r'<a href="\2">\1</a>', text)

def markdown(text):
    parts = []
    table = False
    for line in text.splitlines():
        if line.startswith('|'):
            if not table:
                parts.append('<div class="table"><table>')
                table = True
            if re.match(r'^\|[\s:|\-]+\|$', line):
                continue
            parts.append('<tr>' + ''.join('<td>' + inline(v.strip()) + '</td>' for v in line.strip('|').split('|')) + '</tr>')
            continue
        if table:
            parts.append('</table></div>')
            table = False
        if line.startswith('#'):
            level = min(3, len(line) - len(line.lstrip('#')))
            parts.append(f'<h{level}>{inline(line.lstrip("# "))}</h{level}>')
        elif line.startswith('- '):
            parts.append('<p>• ' + inline(line[2:]) + '</p>')
        elif line.strip():
            parts.append('<p>' + inline(line) + '</p>')
    if table:
        parts.append('</table></div>')
    return ''.join(parts)

manifest = {'revision': 3, 'date': '2026-10-06', 'head': '89b5e157844d62933a5ebfa773e7aa7b8d076cb9', 'branch': 'main', 'isImplemented': False, 'applicationSourceChanged': False, 'nativeEvidenceDate': '2026-10-05', 'nativeDevice': 'iPhone 17 Pro / iOS 26.5', 'designViewportPt': [402, 874], 'contrastPairsPassingAA': sum(x['normalTextAA'] for x in tokens['contrast']), 'contrastPairsChecked': len(tokens['contrast']), 'contrastMinimum': {theme: min(x['ratio'] for x in tokens['contrast'] if x['theme'] == theme) for theme in ['light', 'dark']}, 'artifacts': []}
for board in boards:
    file = root / (board + '.png')
    manifest['artifacts'].append({'file': file.name, 'bytes': file.stat().st_size, 'sha256': hashlib.sha256(file.read_bytes()).hexdigest()})
(root / 'evidence-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2))

style = '*{box-sizing:border-box}body{margin:0;background:#f8f7f4;color:#28242c;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}header{padding:28px 5vw}h1{font-size:29px;margin:0 0 12px}header p{color:#69616b;line-height:1.6;margin:6px 0}nav{position:sticky;top:0;display:flex;gap:8px;flex-wrap:wrap;padding:12px 5vw;background:#f8f7f4f5;border-block:1px solid #e5ded8;z-index:2}button{padding:13px 16px;border:1px solid #e5ded8;border-radius:11px;background:#fff;color:#573c58;font-size:14px;cursor:pointer;min-height:44px}button.selected{background:#573c58;color:white}.panel{display:none;max-width:1500px;margin:24px auto}.panel.active{display:block}.panel img{width:100%;height:auto;display:block}article{max-width:1150px;margin:40px auto 80px;padding:28px;background:#fff;border-radius:20px}article h2{margin-top:35px;font-size:23px}article p{line-height:1.7;margin:8px 0}code{font-size:13px;background:#f0e7f1;padding:2px 5px;border-radius:5px;overflow-wrap:anywhere}a{color:#573c58}.table{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:14px;line-height:1.6}td{padding:12px;vertical-align:top;border-bottom:1px solid #e5ded8;min-width:125px}tr:first-child{font-weight:500;background:#f8f7f4}.evidence{margin:20px;font-weight:500}@media(max-width:700px){header{padding:20px}h1{font-size:25px}nav{padding:10px}button{font-size:12px;padding:11px}.panel{margin:10px 0}article{margin:20px 8px;padding:18px}}'
for locale in ['en', 'zh-CN']:
    english = locale == 'en'
    nav = ''.join(f'<button onclick="show({i})" class="{"selected" if i == 0 else ""}">{label}</button>' for i, label in enumerate(labels + ['v2 / Earlier', '原生证据 / Native']))
    panels = ''.join(f'<section class="panel {"active" if i == 0 else ""}"><img alt="{labels[i]} — v3 static design proposal" src="{image_data(root / (board + ".png"))}"></section>' for i, board in enumerate(boards))
    panels += f'<section class="panel"><p class="evidence">V2 static proposal, preserved for comparison. 旧设计稿，不是实际运行页面。</p><img alt="Preserved v2 design proposal" src="{image_data(repo / "docs/design-language-v2/03-six-screens.png")}"></section>'
    panels += f'<section class="panel"><p class="evidence">2026-10-05 actual native baseline. 真实原生截图，未在本轮重新运行。</p><img alt="Actual native capture from 2026-10-05" src="{image_data(native)}"></section>'
    doc = markdown((root / ('README.md' if english else 'README.zh-CN.md')).read_text())
    title = 'LeanOn v3 — quieter hierarchy' if english else 'LeanOn v3 — 更轻的阅读层级'
    description = 'Static design refinement. Application source and approved native bar preserved.' if english else '静态设计稿收敛。保留应用源码、已认可底栏、多色语义和真实功能状态。'
    result = f'<!doctype html><html lang="{locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{title}</title><style>{style}</style></head><body><header><h1>{title}</h1><p>{description}</p><p>main @ 89b5e157 + preserved local changes · 2026-10-06</p></header><nav>{nav}</nav>{panels}<article>{doc}</article><script>function show(n){{document.querySelectorAll(".panel").forEach((e,i)=>e.classList.toggle("active",i===n));document.querySelectorAll("nav button").forEach((e,i)=>e.classList.toggle("selected",i===n));}}</script></body></html>'
    (root / ('review.html' if english else 'review.zh-CN.html')).write_text(result)

archive = Path('/tmp/leanon-design-language-v3.zip')
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
    for folder in [repo / 'docs/design-language-v2', root]:
        for file in folder.iterdir():
            if file.is_file():
                z.write(file, str(file.relative_to(repo)))
    z.write(repo / 'assets/logo-monochrome.svg', 'assets/logo-monochrome.svg')
    z.write(native, 'native-evidence/2026-10-05-native-overview.png')
    for name in ['today', 'diary', 'progress', 'partner', 'me', 'settings', 'food-saved', 'exercise-saved', 'exercise-edit', 'empty-diary', 'no-weight']:
        file = Path(f'/tmp/leanon-ui-review-20261005/after/final-{name}-ios.png')
        if file.exists():
            z.write(file, 'native-evidence/' + file.name)
print(json.dumps({'boards': len(boards), 'contrast': manifest['contrastMinimum'], 'pairs': len(tokens['contrast']), 'archiveBytes': archive.stat().st_size}))
