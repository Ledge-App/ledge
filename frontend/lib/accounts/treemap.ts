import { holdingGainPct, tileLabel } from './holdings'
import type { Holding } from '@/types/domain'

// Squarified treemap (Bruls, Huizing, van Wijk) for the portfolio allocation heat map:
// tile area = share of portfolio value, kept as close to square as the numbers allow so
// labels stay readable. Pure math — the component just absolutely-positions the output.

export interface AllocationItem {
  securityId: string
  label: string
  /** Plaid security type, for the asset-class color scale. */
  type: string | null
  value: number
  /** Share of total portfolio value, 0..1. */
  weight: number
  /** (value - basis) / basis, null when the institution reported no usable basis. */
  gainPct: number | null
}

/** A laid-out tile. Generic in its payload so the same algorithm serves holdings and accounts. */
export interface TreemapRect<T = AllocationItem> {
  item: T
  x: number
  y: number
  width: number
  height: number
}

/** The only thing squarify needs of an item: its share of the box, 0..1. */
export interface Weighted {
  weight: number
}


/** Holdings -> weighted allocation, largest first. Valueless positions can't be drawn. */
export function computeAllocation(holdings: Holding[]): AllocationItem[] {
  const valued = holdings.filter((h) => (h.institutionValue ?? 0) > 0)
  const total = valued.reduce((sum, h) => sum + h.institutionValue!, 0)
  if (total <= 0) return []
  return valued
    .map((h) => ({
      securityId: h.securityId,
      label: tileLabel(h),
      type: h.type,
      value: h.institutionValue!,
      weight: h.institutionValue! / total,
      gainPct: holdingGainPct(h),
    }))
    .sort((a, b) => b.weight - a.weight)
}

function worstAspect(rowAreas: number[], side: number): number {
  const sum = rowAreas.reduce((a, b) => a + b, 0)
  const rowThickness = sum / side
  let worst = 1
  for (const area of rowAreas) {
    const length = area / rowThickness
    const aspect = Math.max(length / rowThickness, rowThickness / length)
    if (aspect > worst) worst = aspect
  }
  return worst
}

/**
 * Lay out items (assumed sorted desc by weight) into width x height.
 *
 * Generic over the payload: the algorithm only ever reads `weight`, so holdings, accounts and
 * account groups all lay out through this one tested implementation rather than through
 * copies that could drift apart.
 */
export function squarify<T extends Weighted>(items: T[], width: number, height: number): TreemapRect<T>[] {
  if (items.length === 0 || width <= 0 || height <= 0) return []

  const totalWeight = items.reduce((sum, i) => sum + i.weight, 0)
  if (totalWeight <= 0) return []
  const scale = (width * height) / totalWeight

  const rects: TreemapRect<T>[] = []
  let x = 0
  let y = 0
  let remainingWidth = width
  let remainingHeight = height
  let row: T[] = []

  const areaOf = (item: T) => item.weight * scale

  function layoutRow(finalRow: T[]) {
    const rowArea = finalRow.reduce((sum, i) => sum + areaOf(i), 0)
    const horizontal = remainingWidth < remainingHeight // rows lay along the shorter side
    const side = horizontal ? remainingWidth : remainingHeight
    const thickness = rowArea / side

    let offset = 0
    for (const item of finalRow) {
      const length = areaOf(item) / thickness
      rects.push(
        horizontal
          ? { item, x: x + offset, y, width: length, height: thickness }
          : { item, x, y: y + offset, width: thickness, height: length },
      )
      offset += length
    }
    if (horizontal) {
      y += thickness
      remainingHeight -= thickness
    } else {
      x += thickness
      remainingWidth -= thickness
    }
  }

  for (const item of items) {
    const side = Math.min(remainingWidth, remainingHeight)
    const currentAreas = row.map(areaOf)
    if (row.length === 0 || worstAspect([...currentAreas, areaOf(item)], side) <= worstAspect(currentAreas, side)) {
      row.push(item)
    } else {
      layoutRow(row)
      row = [item]
    }
  }
  if (row.length > 0) layoutRow(row)

  return rects
}

export interface ClassShare {
  key: string
  weight: number
}

/** Share of portfolio per asset-class key, descending — the legend's percentages. */
export function classBreakdown(items: AllocationItem[]): Map<string, number> {
  const byClass = new Map<string, number>()
  for (const item of items) {
    const key = item.type ?? 'other'
    byClass.set(key, (byClass.get(key) ?? 0) + item.weight)
  }
  return byClass
}
