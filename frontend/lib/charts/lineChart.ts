/** Pure scale/path math for the spending trend chart. No React Native imports. */

/**
 * Gridline values from 0 up to at least `max`, snapped to 1/2/5 x 10^n steps.
 * The top tick always covers `max`, so callers can use it as the y-domain
 * without the data overflowing the plot.
 */
export function niceScale(max: number, ticks = 5): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0, 1]
  const rough = max / ticks
  const mag = Math.pow(10, Math.floor(Math.log10(rough)))
  const r = rough / mag
  const step = r <= 1.5 ? mag : r <= 3 ? 2 * mag : r <= 7 ? 5 * mag : 10 * mag
  // Round up so the top tick always covers the data, and multiply rather than
  // accumulate so fractional steps don't drift.
  const count = Math.ceil(max / step - 1e-9)
  const result: number[] = []
  for (let i = 0; i <= count; i++) result.push(i * step)
  return result
}

export function formatTick(v: number, step: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}K`
  const decimals = step >= 1 ? 0 : step >= 0.1 ? 1 : 2
  return v.toFixed(decimals)
}

/**
 * Catmull-Rom-ish cubic bezier through `pts`. Control points are clamped to
 * [yMin, yMax]; since a cubic bezier stays inside the convex hull of its
 * control points, that keeps the smoothed curve from overshooting the plot.
 */
export function smoothLine(pts: { x: number; y: number }[], yMin: number, yMax: number): string {
  if (pts.length < 2) return ''
  if (pts.length === 2) return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`
  const clampY = (y: number) => Math.min(yMax, Math.max(yMin, y))
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(pts.length - 1, i + 2)]
    const t = 6
    const c1y = clampY(p1.y + (p2.y - p0.y) / t)
    const c2y = clampY(p2.y - (p3.y - p1.y) / t)
    d += ` C ${p1.x + (p2.x - p0.x) / t} ${c1y} ${p2.x - (p3.x - p1.x) / t} ${c2y} ${p2.x} ${p2.y}`
  }
  return d
}
