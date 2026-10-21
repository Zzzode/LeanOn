export interface ChartPoint { x: number; y: number }

/** Fractions in a displayed calendar window; y=0 is the upper edge. */
export function buildWeightChartGeometry(points: readonly ChartPoint[], windowDays: number): {
  points: ChartPoint[];
  ticks: { value: number; y: number }[];
} {
  if (points.length === 0) return { points: [], ticks: [] };
  const values = points.map(p => p.y);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = Math.max(0.2, (hi - lo) * 0.15);
  const min = lo - pad;
  const max = hi + pad;
  const yAt = (value: number) => (max - value) / (max - min);
  return {
    points: points.map(p => ({ x: windowDays <= 1 ? 0.5 : p.x / (windowDays - 1), y: yAt(p.y) })),
    ticks: [max, (max + min) / 2, min].map(value => ({ value, y: yAt(value) })),
  };
}
