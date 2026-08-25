import { describe, expect, it } from 'vitest'
import { computeAllocation, squarify } from './treemap'
import type { AllocationItem } from './treemap'
import type { Holding } from '@/types/domain'

function holding(overrides: Partial<Holding>): Holding {
  return {
    securityId: 'sec-1',
    type: 'etf',
    name: 'Security',
    ticker: 'TICK',
    quantity: 10,
    institutionValue: 1000,
    costBasis: 800,
    institutionPrice: 100,
    closePrice: 98,
    priceAsOf: null,
    optionContract: null,
    isoCurrencyCode: 'USD',
    ...overrides,
  }
}

describe('computeAllocation', () => {
  it('weights holdings by share of total value, largest first', () => {
    const allocation = computeAllocation([
      holding({ securityId: 'a', institutionValue: 250 }),
      holding({ securityId: 'b', institutionValue: 750 }),
    ])
    expect(allocation.map((a) => a.securityId)).toEqual(['b', 'a'])
    expect(allocation.map((a) => a.weight)).toEqual([0.75, 0.25])
    expect(allocation.reduce((s, a) => s + a.weight, 0)).toBeCloseTo(1)
  })

  it('computes gain percentage from total cost basis', () => {
    const [a] = computeAllocation([holding({ institutionValue: 1000, costBasis: 800 })])
    expect(a.gainPct).toBeCloseTo(0.25)
  })

  it('leaves gain null without a usable basis', () => {
    const [a] = computeAllocation([holding({ costBasis: null })])
    expect(a.gainPct).toBeNull()
  })

  it('drops valueless positions and returns empty for a valueless portfolio', () => {
    expect(computeAllocation([holding({ institutionValue: null })])).toEqual([])
    const allocation = computeAllocation([holding({ institutionValue: null }), holding({ securityId: 'b' })])
    expect(allocation.map((a) => a.securityId)).toEqual(['b'])
  })
})

describe('squarify', () => {
  function items(weights: number[]): AllocationItem[] {
    return weights.map((weight, i) => ({
      securityId: `s${i}`,
      label: `S${i}`,
      type: null,
      value: weight * 1000,
      weight,
      gainPct: null,
    }))
  }

  it('tiles areas proportional to weights and fills the container', () => {
    const rects = squarify(items([0.5, 0.3, 0.2]), 200, 100)
    const total = 200 * 100
    const areas = rects.map((r) => r.width * r.height)
    expect(areas.reduce((a, b) => a + b, 0)).toBeCloseTo(total, 5)
    expect(areas[0] / total).toBeCloseTo(0.5, 5)
    expect(areas[1] / total).toBeCloseTo(0.3, 5)
    expect(areas[2] / total).toBeCloseTo(0.2, 5)
  })

  it('keeps every tile inside the container', () => {
    const rects = squarify(items([0.4, 0.25, 0.15, 0.1, 0.06, 0.04]), 320, 200)
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(-1e-6)
      expect(r.y).toBeGreaterThanOrEqual(-1e-6)
      expect(r.x + r.width).toBeLessThanOrEqual(320 + 1e-6)
      expect(r.y + r.height).toBeLessThanOrEqual(200 + 1e-6)
    }
  })

  it('handles a single holding as the full container', () => {
    const rects = squarify(items([1]), 100, 80)
    expect(rects).toHaveLength(1)
    expect(rects[0]).toMatchObject({ x: 0, y: 0, width: 100, height: 80 })
  })

  it('returns nothing for empty input or a degenerate container', () => {
    expect(squarify([], 100, 100)).toEqual([])
    expect(squarify(items([1]), 0, 100)).toEqual([])
  })

  it('keeps tiles reasonably square for a realistic mix', () => {
    const rects = squarify(items([0.35, 0.25, 0.2, 0.12, 0.08]), 300, 200)
    for (const r of rects) {
      const aspect = Math.max(r.width / r.height, r.height / r.width)
      expect(aspect).toBeLessThan(4)
    }
  })
})
