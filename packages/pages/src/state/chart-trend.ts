import type { ChartPoint } from './chart.js';

/** Fit only observed calendar positions; missing dates are never synthesized as data. */
export function fitChartTrend(points: readonly ChartPoint[]): ChartPoint[] {
  if (points.length < 2) return [];
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  const variance = points.reduce((sum, point) => sum + (point.x - meanX) ** 2, 0);
  if (variance === 0) return [];
  const slope = points.reduce((sum, point) => sum + (point.x - meanX) * (point.y - meanY), 0) / variance;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  return [first.x, last.x].map(x => ({ x, y: meanY + slope * (x - meanX) }));
}
