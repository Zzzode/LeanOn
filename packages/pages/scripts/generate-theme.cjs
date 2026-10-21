// Materialize the shared palette for native runtimes that drop inline CSS variables.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const palettes = require(path.join(root, 'src/state/theme-palette.json'));
const source = fs.readFileSync(path.join(root, 'src/App.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rules = Array.from(source.matchAll(/([^{}]+)\{([^{}]*)\}/g)).filter(([_, selectors]) => !selectors.trim().startsWith('@') && !['from', 'to', '0%', '40%', '100%'].includes(selectors.trim()));
const scopes = { brand: 'brand', food: 'foodText', weight: 'weightText', exercise: 'exerciseText', water: 'waterText' };
const resolve = (value, palette, role = 'brand') => value.replace(/var\(--([\w-]+)\)/g, (_, key) => palette[key === 'action' || key === 'focus' ? role : key] ?? (() => { throw new Error(`Unknown theme token ${key}`); })());
const selector = (value, theme) => value.trim().replace(/^\.Page(?:Root)?(?![\w-])/, match => `${match}.Theme-${theme}`).includes(`.Theme-${theme}`) ? value.trim().replace(/^\.Page(?:Root)?(?![\w-])/, match => `${match}.Theme-${theme}`) : `.Theme-${theme} ${value.trim()}`;
const output = ['/* Generated from App.css and state/theme-palette.json; run the package build to update. */'];
for (const [theme, palette] of Object.entries(palettes)) {
  for (const [_, selectors, body] of rules) {
    const declarations = body.split(';').map(value => value.trim()).filter(value => value && !value.startsWith('--'));
    if (declarations.length === 0) continue;
    output.push(`${selectors.split(',').map(value => selector(value, theme)).join(', ')} { ${declarations.map(value => resolve(value, palette)).join('; ')}; }`);
  }
  for (const [scope, role] of Object.entries(scopes)) {
    for (const [_, selectors, body] of rules) {
      const declarations = body.split(';').map(value => value.trim()).filter(value => !value.startsWith('--') && /var\(--(?:action|focus)\)/.test(value));
      if (declarations.length === 0) continue;
      const scopedSelectors = selectors.split(',').flatMap(value => {
        const trimmed = value.trim();
        return [`.Theme-${theme} .Theme-${scope} ${trimmed}`, `.Theme-${theme} ${trimmed}.Theme-${scope}`];
      });
      output.push(`${scopedSelectors.join(', ')} { ${declarations.map(value => resolve(value, palette, role)).join('; ')}; }`);
    }
  }
  // State boundaries must win over scoped semantic action and focus colors.
  for (const scope of Object.keys(scopes)) {
    const prefix = `.Theme-${theme} .Theme-${scope}`;
    output.push(`${prefix} .Sheet-btn.disabled, ${prefix} .Sheet-btn.primary.disabled { background-color: ${palette.control}; opacity: 1; }`);
    output.push(`${prefix} .Sheet-btn.disabled .Sheet-btn-label { color: ${palette.muted}; }`);
    output.push(`${prefix} .Sheet-btn.disabled.tap-feedback-hover { background-color: ${palette.control}; transform: none; }`);
    output.push(`${prefix} .Sheet-field.invalid, ${prefix} .Food-form-cell.invalid, ${prefix} .Exercise-type-list.invalid { border: 2px solid ${palette.danger}; }`);
  }
}
fs.writeFileSync(path.join(root, 'src/theme.generated.css'), `${output.join('\n')}\n`);
