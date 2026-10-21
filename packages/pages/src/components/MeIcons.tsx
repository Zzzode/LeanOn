import { useTheme } from './ThemeContext.js';
/**
 * Inline SVG icons for the Me screen settings list.
 *
 * Lynx renders SVG through the `content` string prop (see BottomTabBar),
 * so each icon is a 24x24 SVG document wrapped in a sized `<svg>` element.
 * Stroke color comes from the active shared palette.
 */

const SVG_HEAD =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" ' +
  'fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round">';

function meSvg(color: string, inner: string): string {
  return SVG_HEAD.replace('currentColor', color) + inner + '</svg>';
}

/** Person outline: circle head and shoulders arc. */
export function IconProfile() {
  const palette = useTheme();
  return (
    <svg
      className="MeRow-icon"
      current-color={palette.muted}
      content={meSvg(palette.muted,
        '<circle cx="12" cy="8" r="4"/>' +
          '<path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
      )}
    />
  );
}

/** Target / bullseye: three concentric circles. */
export function IconGoal() {
  const palette = useTheme();
  return (
    <svg
      className="MeRow-icon"
      current-color={palette.muted}
      content={meSvg(palette.muted,
        '<circle cx="12" cy="12" r="9"/>' +
          '<circle cx="12" cy="12" r="5"/>' +
          '<circle cx="12" cy="12" r="1.5"/>',
      )}
    />
  );
}

/** Leaf with a center vein. */
export function IconDiet() {
  const palette = useTheme();
  return (
    <svg
      className="MeRow-icon"
      current-color={palette.muted}
      content={meSvg(palette.muted,
        '<path d="M5 19C5 9 12 4 20 4c0 8-5 15-15 15Z"/>' +
          '<path d="M5 19c3-6 7-9 11-11"/>',
      )}
    />
  );
}

/** Heart outline. */
export function IconHealth() {
  const palette = useTheme();
  return (
    <svg
      className="MeRow-icon"
      current-color={palette.muted}
      content={meSvg(palette.muted,
        '<path d="M12 20s-7-4.4-9-8.4C1.6 8.6 3 5.5 6 5.5c1.8 0 3 .9 4 2 1-1.1 2.2-2 4-2 3 0 4.4 3.1 3 6.1C19 15.6 12 20 12 20Z"/>',
      )}
    />
  );
}

/** Balance scale: post, beam and two pans. */
export function IconScale() {
  const palette = useTheme();
  return <svg className="MeRow-icon" current-color={palette.weightText} content={meSvg(palette.weightText, '<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M7 9a5 5 0 0 1 10 0Z"/><path d="m12 9 2-3"/>')} />;
}

/** Bell outline with clapper. */
export function IconBell() {
  const palette = useTheme();
  return (
    <svg
      className="MeRow-icon"
      current-color={palette.muted}
      content={meSvg(palette.muted,
        '<path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z"/>' +
          '<path d="M10 19a2 2 0 0 0 4 0"/>',
      )}
    />
  );
}

/** Gear: hub circle with six spokes. */
export function IconSettings() {
  const palette = useTheme();
  return (
    <svg
      className="MeRow-icon"
      current-color={palette.muted}
      content={meSvg(palette.muted,
        '<circle cx="12" cy="12" r="3.5"/>' +
          '<path d="M17.5 12h3M3.5 12h3"/>' +
          '<path d="M14.75 7.24 16.25 4.64M9.25 7.24 7.75 4.64"/>' +
          '<path d="M9.25 16.76 7.75 19.36M14.75 16.76 16.25 19.36"/>',
      )}
    />
  );
}

/** Arrow pointing up-right out of a box. */
export function IconExport() {
  const palette = useTheme();
  return (
    <svg
      className="MeRow-icon"
      current-color={palette.muted}
      content={meSvg(palette.muted,
        '<path d="M14 4h6v6"/>' +
          '<path d="M20 4 11 13"/>' +
          '<path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
      )}
    />
  );
}

/** Circled "i". */
export function IconInfo() {
  const palette = useTheme();
  return (
    <svg
      className="MeRow-icon"
      current-color={palette.muted}
      content={meSvg(palette.muted,
        '<circle cx="12" cy="12" r="9"/>' +
          '<path d="M12 16v-5"/>' +
          '<path d="M12 8h.01"/>',
      )}
    />
  );
}
