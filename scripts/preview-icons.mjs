import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = new URL('../', import.meta.url);
const args = process.argv.slice(2);
assert(args.length === 2, 'Usage: node scripts/preview-icons.mjs <before-git-ref> <output.svg>');
const [before, output] = args;
assert(output.endsWith('.svg'), 'The preview output must have an .svg extension');
const load = (path, previous) => previous
  ? execFileSync('git', ['show', `${before}:${path}`], { cwd: fileURLToPath(root) })
  : readFile(new URL(path, root));
const layers = {};
for (const name of ['foreground', 'monochrome']) {
  const path = `apps/android/app/src/main/res/drawable/ic_launcher_${name}.xml`;
  layers[name] = [(await load(path, true)).toString(), (await load(path, false)).toString()];
}
const attr = (xml, name) => Number(xml.match(new RegExp(`android:${name}="([^"]+)"`))[1]);
const width = (xml) => attr(xml, 'scaleX') * 1068 / 72 * 100;
const anchor = (xml) => attr(xml, 'translateY') + 627 * attr(xml, 'scaleY');
const shift = anchor(layers.foreground[1]) - anchor(layers.foreground[0]);
const escape = (text) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const label = (x, y, text, size = 16) => `<text x="${x}" y="${y}" font-family="sans-serif" font-size="${size}" fill="#263447">${escape(text)}</text>`;
const vector = (xml, tint) => {
  const paths = [...xml.matchAll(/<path\s+android:fillColor="([^"]+)"\s+android:pathData="([^"]+)"/g)];
  return `<g transform="translate(${attr(xml, 'translateX')} ${attr(xml, 'translateY')}) scale(${attr(xml, 'scaleX')} ${attr(xml, 'scaleY')})">${paths.map(([, color, path]) => `<path fill="${tint ?? color.slice(0, 7)}" d="${path}"/>`).join('')}</g>`;
};
let id = 0;
const tile = (xml, shape, x, y, size, themed = false, debug = false) => {
  const key = `mask${id++}`;
  const mask = shape === 'circle' ? '<circle cx="54" cy="54" r="36"/>'
    : shape === 'squircle' ? '<path d="M54 18 C84 18 90 24 90 54 C90 84 84 90 54 90 C24 90 18 84 18 54 C18 24 24 18 54 18 Z"/>'
      : '<rect x="18" y="18" width="72" height="72" rx="16"/>';
  const guides = debug ? '<rect x="18" y="18" width="72" height="72" fill="none" stroke="#64748b" stroke-width=".35"/><circle cx="54" cy="54" r="33" fill="none" stroke="#ef4444" stroke-width=".35" stroke-dasharray="1 1"/><path d="M18 54 H90" stroke="#64748b" stroke-width=".35" stroke-dasharray="1 1"/>' : '';
  return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="${debug ? '0 0 108 108' : '18 18 72 72'}"><defs><clipPath id="${key}">${mask}</clipPath></defs><g ${debug ? '' : `clip-path="url(#${key})"`}><rect width="108" height="108" fill="${themed ? '#dcebe1' : '#fff'}"/>${vector(xml, themed ? '#365e48' : undefined)}</g>${guides}</svg>`;
};
const parts = ['<svg xmlns="http://www.w3.org/2000/svg" width="1320" height="1210" viewBox="0 0 1320 1210"><rect width="1320" height="1210" fill="#edf1f6"/>'];
parts.push(label(30, 36, 'LeanOn — optical centering / before and after', 26));
parts.push(label(30, 66, `Baseline: ${before} | Width: ${width(layers.foreground[0]).toFixed(2)}% → ${width(layers.foreground[1]).toFixed(2)}% | Vertical anchor: +${shift.toFixed(2)}dp`, 17));
parts.push(label(30, 93, `Same heart paths and colors. ${shift.toFixed(2)}dp = ${(shift / 72 * 100).toFixed(2)}% of visible height = ${(shift / 72 * 1024).toFixed(2)}px in a 1024px export.`, 16));
const columns = [['circle', 30], ['rounded square', 355], ['squircle', 680], ['themed circle', 1005]];
for (const [name, x] of columns) {
  parts.push(label(x, 127, name, 18));
  parts.push(label(x + 34, 154, 'Before', 15), label(x + 192, 154, 'After', 15));
  for (let version = 0; version < 2; version++) {
    const themed = name === 'themed circle';
    parts.push(tile(layers[themed ? 'monochrome' : 'foreground'][version], themed ? 'circle' : name, x + version * 158, 172, 136, themed));
  }
}
parts.push(label(30, 351, 'Actual pixels — 24 / 32 / 48 / 64px; before and after remain side by side', 18));
for (const [name, x] of columns) {
  const themed = name === 'themed circle';
  for (const [size, y] of [[24, 380], [32, 426], [48, 480], [64, 550]]) {
    parts.push(label(x + 125, y + size / 2 + 5, `${size}px`, 13));
    for (let version = 0; version < 2; version++) {
      parts.push(tile(layers[themed ? 'monochrome' : 'foreground'][version], themed ? 'circle' : name, x + version * 158 + (136 - size) / 2, y, size, themed));
    }
  }
}
parts.push(label(30, 677, 'Native iOS export / marketing tile / favicon — same normalized vertical offset', 18));
for (const [name, title, x] of [['app-icon-ios-1024.png', 'iOS (rounded mask)', 30], ['app-icon.png', 'Marketing PNG', 465], ['favicon.svg', 'Favicon', 900]]) {
  parts.push(label(x, 713, title, 18));
  for (let version = 0; version < 2; version++) {
    const bytes = await load(`assets/${name}`, version === 0);
    const mime = name.endsWith('.svg') ? 'image/svg+xml' : 'image/png';
    const href = `data:${mime};base64,${bytes.toString('base64')}`;
    const px = x + version * 174;
    parts.push(label(px + 34, 743, version ? 'After' : 'Before', 15));
    const key = `static${id++}`;
    parts.push(`<svg x="${px}" y="760" width="136" height="136" viewBox="0 0 136 136"><defs><clipPath id="${key}"><rect width="136" height="136" rx="30"/></clipPath></defs><image width="136" height="136" href="${href}" ${name.includes('ios') ? `clip-path="url(#${key})"` : ''}/></svg>`);
    let smallX = px;
    for (const size of [16, 24, 32, 48]) {
      parts.push(`<image x="${smallX}" y="923" width="${size}" height="${size}" href="${href}"/>`);
      smallX += size + 5;
    }
  }
}
parts.push(label(30, 1019, 'Layer guides only: 72dp viewport / 66dp safe circle / horizontal icon center', 17));
for (let version = 0; version < 2; version++) {
  parts.push(tile(layers.foreground[version], 'circle', 35 + version * 150, 1040, 120, false, true));
  parts.push(label(35 + version * 150, 1182, version ? 'After' : 'Before', 14));
}
parts.push(label(395, 1082, 'Filled-area and luminance-contrast centroids guide the offset.', 17));
parts.push(label(395, 1114, 'The lower tip does not carry as much visual weight as the upper lobes.', 17));
parts.push(label(395, 1146, 'These are resource-based previews; launcher normalization varies by device.', 15));
parts.push('</svg>');
const svg = parts.join('\n');
await writeFile(output, svg);
await sharp(Buffer.from(svg)).png().toFile(output.replace(/\.svg$/, '.png'));
console.log(`Side-by-side comparison written to ${output} and PNG.`);
