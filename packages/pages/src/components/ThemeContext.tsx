import { createContext, useContext, type Context } from '@lynx-js/react';
import { palettes, type ThemePalette } from '../state/theme.js';

export const ThemeContext: Context<ThemePalette> = createContext<ThemePalette>(palettes.light);

export function useTheme(): ThemePalette {
  return useContext(ThemeContext);
}
