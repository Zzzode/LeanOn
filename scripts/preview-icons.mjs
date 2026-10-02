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
const resource = 'apps/android/app/src/main/res/drawable/ic_launcher_';
const load = (name, previous) => previous
  ? execFileSync('git', ['show', `${before}:${resource}${name}.xml`], { cwd: fileURLToPath(root), encoding: 'utf8' })
  : readFile(new URL(`${resource}${name}.xml`, root), 'utf8');
const layers = {};
for (const name of ['foreground', 'monochrome']) {
  layers[name] = [await load(name, true), await load(name, false)];
}
const escape = (text) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const vector = (xml, tint) => {
  const attr = (name) => xml.match(new RegExp(`android:${name}="([^"]+)"`))[1];
  const shapes = [...xml.matchAll(/<path\s+android:fillColor="([^"]+)"\s+android:pathData="([^"]+)"/g)];
  return `<g transform="translate(${attr('translateX')} ${attr('translateY')}) scale(${attr('scaleX')} ${attr('scaleY')})">${shapes.map(([, color, path]) => `<path fill="${tint ?? color.slice(0, 7)}" d="${path}"/>`).join('')}</g>`;
};
let id = 0;
const tile = (xml, shape, x, y, size, themed = false, debug = false) => {
  const key = `mask${id++}`;
  const mask = shape === 'circle'
    ? '<circle cx="54" cy="54" r="36"/>'
    : shape === 'squircle'
      ? '<path d="M54 18 C84 18 90 24 90 54 C90 84 84 90 54 90 C24 90 18 84 18 54 C18 24 24 18 54 18 Z"/>'
      : '<rect x="18" y="18" width="72" height="72" rx="16"/>';
  const guides = debug ? '<rect x="18" y="18" width="72" height="72" fill="none" stroke="#64748b" stroke-width=".4"/><circle cx="54" cy="54" r="33" fill="none" stroke="#ef4444" stroke-width=".4" stroke-dasharray="1 1"/>' : '';
  const field = themed ? '#dcebe1' : '#fff';
  return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="${debug ? '0 0 108 108' : '18 18 72 72'}"><defs><clipPath id="${key}">${mask}</clipPath></defs><rect width="108" height="108" fill="${debug ? '#dbe3ed' : 'none'}"/><g ${debug ? '' : `clip-path="url(#${key})"`}><rect width="108" height="108" fill="${field}"/>${vector(xml, themed ? '#365e48' : undefined)}</g>${guides}</svg>`;
};
const label = (x, y, text, size = 16) => `<text x="${x}" y="${y}" font-family="sans-serif" font-size="${size}" fill="#263447">${escape(text)}</text>`;
const parts = ['<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="1230" viewBox="0 0 1120 1230"><rect width="1120" height="1230" fill="#edf1f6"/>'];
parts.push(label(30, 36, 'LeanOn — Android icon proportion correction', 24));
parts.push(label(30, 64, `Before: ${before} (~91.7%)     After: 80% visible width, measured safe-circle fit`, 16));
parts.push(label(30, 88, '108dp layer -> central 72dp viewport. Original heart paths and colors retained.', 14));
const columns = [['circle', 240], ['rounded square', 470], ['squircle', 700], ['themed circle', 930]];
for (const [name, x] of columns) parts.push(label(x, 120, name, 14));
for (let version = 0; version < 2; version++) {
  const y = 145 + version * 210;
  parts.push(label(30, y + 75, version ? 'After' : 'Before', 20));
  for (const [name, x] of columns) {
    const themed = name === 'themed circle';
    parts.push(tile(layers[themed ? 'monochrome' : 'foreground'][version], themed ? 'circle' : name, x, y, 160, themed));
  }
}
parts.push(label(30, 594, 'Actual pixels — no enlargement: 24 / 32 / 48 / 64px', 18));
for (let version = 0; version < 2; version++) {
  const y = 618 + version * 80;
  parts.push(label(30, y + 36, version ? 'After' : 'Before'));
  for (const [name, x] of columns) {
    let offset = 0;
    for (const size of [24, 32, 48, 64]) {
      const themed = name === 'themed circle';
      parts.push(tile(layers[themed ? 'monochrome' : 'foreground'][version], themed ? 'circle' : name, x + offset, y + 64 - size, size, themed));
      offset += size + 6;
    }
  }
}
parts.push(label(30, 804, 'Layer geometry: square = 72dp viewport; dashed circle = 66dp safe zone', 17));
for (let version = 0; version < 2; version++) {
  parts.push(tile(layers.foreground[version], 'circle', 250 + version * 190, 830, 140, false, true));
  parts.push(label(250 + version * 190, 991, version ? 'After' : 'Before', 14));
}
for (let version = 0; version < 2; version++) {
  const bytes = version ? await readFile(new URL('assets/app-icon-ios-1024.png', root))
    : execFileSync('git', ['show', `${before}:assets/app-icon-ios-1024.png`], { cwd: fileURLToPath(root) });
  const x = 700 + version * 190;
  parts.push(`<image x="${x}" y="830" width="140" height="140" href="data:image/png;base64,${bytes.toString('base64')}"/>`);
  parts.push(label(x, 991, version ? 'iOS after: 80%' : 'iOS before: 85.17%', 14));
}
parts.push(label(30, 1040, 'Static exports: marketing tile / favicon — 96px and actual 16 / 24 / 32px', 17));
for (let version = 0; version < 2; version++) {
  const x = 250 + version * 400;
  parts.push(label(x, 1070, version ? 'After' : 'Before', 16));
  for (const [name, offset] of [['app-icon.png', 0], ['favicon.svg', 150]]) {
    const bytes = version ? await readFile(new URL(`assets/${name}`, root))
      : execFileSync('git', ['show', `${before}:assets/${name}`], { cwd: fileURLToPath(root) });
    const mime = name.endsWith('.svg') ? 'image/svg+xml' : 'image/png';
    const href = `data:${mime};base64,${bytes.toString('base64')}`;
    parts.push(`<image x="${x + offset}" y="1085" width="96" height="96" href="${href}"/>`);
    let smallX = x + offset;
    for (const size of [16, 24, 32]) {
      parts.push(`<image x="${smallX}" y="1190" width="${size}" height="${size}" href="${href}"/>`);
      smallX += size + 6;
    }
  }
}
parts.push('</svg>');
await writeFile(output, parts.join('\n'));
await sharp(Buffer.from(parts.join('\n'))).png().toFile(output.replace(/\.svg$/, '.png'));
console.log(`Comparison written to ${output} and PNG; representative masks, not a device screenshot.`);
