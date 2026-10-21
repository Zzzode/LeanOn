import themePalette from './theme-palette.json';

/** Shared v3 palette: CSS, SVG and interactive states use the same roles. */
export const palettes = themePalette;

export type ThemePalette = { [K in keyof typeof palettes.light]: string };

/** CSS variables inherit through page content and native input sheet wrappers. */
export function paletteStyle(palette: ThemePalette): string {
  return Object.entries(palette).map(([key, value]) => `--${key}:${value}`).join(';');
}

export function formatQuantity(value: number, precision = 0): string {
  const [integer, fraction] = value.toFixed(precision).split('.');
  const grouped = (integer ?? '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}
