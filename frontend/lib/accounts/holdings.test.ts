import { describe, expect, it } from 'vitest'
import { averageCost, formatShares, holdingLabel, totalHoldingsValue } from './holdings'
import type { Holding } from '@/types/domain'

function holding(overrides: Partial<Holding>): Holding {
  return {
    securityId: 'sec-1',
    type: 'etf',
    name: 'Vanguard Total Stock Market ETF',
    ticker: 'VTI',
    quantity: 10,
    institutionValue: 2500,
    costBasis: 2000,
    institutionPrice: 250,
    closePrice: 245,
    optionContract: null,
    isoCurrencyCode: 'USD',
    ...overrides,
  }
}

describe('averageCost', () => {
  it('divides total basis by shares', () => {
    expect(averageCost(holding({ costBasis: 2000, quantity: 10 }))).toBe(200)
  })

  it('is null when the institution reported no basis', () => {
    expect(averageCost(holding({ costBasis: null }))).toBeNull()
  })

  it('is null for zero or short positions rather than dividing by <= 0', () => {
    expect(averageCost(holding({ quantity: 0 }))).toBeNull()
    expect(averageCost(holding({ quantity: -5 }))).toBeNull()
  })
})

describe('holdingLabel', () => {
  it('prefers ticker, falls back to name, then placeholder', () => {
    expect(holdingLabel(holding({}))).toBe('VTI')
    expect(holdingLabel(holding({ ticker: null }))).toBe('Vanguard Total Stock Market ETF')
    expect(holdingLabel(holding({ ticker: null, name: null }))).toBe('Unknown holding')
  })
})

describe('formatShares', () => {
  it('keeps whole numbers whole and trims fractional trailing zeros', () => {
    expect(formatShares(12)).toBe('12')
    expect(formatShares(0.5)).toBe('0.5')
    expect(formatShares(1.2345678)).toBe('1.2346')
    expect(formatShares(2.1)).toBe('2.1')
  })

  it('compacts huge counts like a cash sweep denominated in dollars', () => {
    expect(formatShares(12345.678)).toBe('12.35k')
    expect(formatShares(151_100)).toBe('151.1k')
    expect(formatShares(2_500_000)).toBe('2.5M')
    expect(formatShares(10_000)).toBe('10k')
  })

  it('keeps two significant digits for dust instead of rounding to zero', () => {
    expect(formatShares(0.000029)).toBe('0.000029')
    expect(formatShares(0.00005)).toBe('0.000050')
  })
})

describe('totalHoldingsValue', () => {
  it('sums values, treating unreported ones as zero', () => {
    expect(totalHoldingsValue([holding({}), holding({ institutionValue: null }), holding({ institutionValue: 100 })])).toBe(2600)
  })
})

describe('monogram', () => {
  it('builds 1-2 character labels', async () => {
    const { monogramText } = await import('./holdings')
    expect(monogramText('VTI')).toBe('VT')
    expect(monogramText('S&P 500')).toBe('SP')
    expect(monogramText('')).toBe('?')
  })
})

describe('performance color scale', () => {
  it('computes gain from total basis and value', async () => {
    const { holdingGainPct } = await import('./holdings')
    expect(holdingGainPct(holding({ institutionValue: 1000, costBasis: 800 }))).toBeCloseTo(0.25)
    expect(holdingGainPct(holding({ costBasis: null }))).toBeNull()
    expect(holdingGainPct(holding({ costBasis: 0 }))).toBeNull()
  })

  it('greens gains, reds losses, saturates, and neutrals the basisless', async () => {
    const { performanceColor } = await import('./holdings')
    expect(performanceColor(0.1).base).not.toBe(performanceColor(-0.1).base)
    // Deeper tint for a larger move of the same sign.
    expect(performanceColor(0.05).fill).not.toBe(performanceColor(0.5).fill)
    // Saturation: beyond +/-25% the tint stops deepening.
    expect(performanceColor(0.25).fill).toBe(performanceColor(0.9).fill)
    expect(performanceColor(null).base).toBeDefined()
  })
})

describe('asset classes', () => {
  it('maps plaid security types to classes and falls back to Other', async () => {
    const { assetClass, tileLabel } = await import('./holdings')
    expect(assetClass('etf').label).toBe('ETFs')
    expect(assetClass('cash').shortLabel).toBe('CASH')
    expect(assetClass('weird-new-type').label).toBe('Other')
    expect(assetClass(null).label).toBe('Other')
    // Ticker wins; class short-label stands in for tickerless holdings.
    expect(tileLabel({ ticker: 'VTI', type: 'etf', optionContract: null })).toBe('VTI')
    expect(tileLabel({ ticker: null, type: 'cash', optionContract: null })).toBe('CASH')
    expect(tileLabel({ ticker: null, type: 'fixed income', optionContract: null })).toBe('BOND')
  })
})

describe('dayChangePct', () => {
  it('derives the move from close to latest price', async () => {
    const { dayChangePct } = await import('./holdings')
    expect(dayChangePct({ institutionPrice: 102, closePrice: 100 })).toBeCloseTo(0.02)
    expect(dayChangePct({ institutionPrice: 98, closePrice: 100 })).toBeCloseTo(-0.02)
    expect(dayChangePct({ institutionPrice: null, closePrice: 100 })).toBeNull()
    expect(dayChangePct({ institutionPrice: 100, closePrice: null })).toBeNull()
    expect(dayChangePct({ institutionPrice: 100, closePrice: 0 })).toBeNull()
  })
})

describe('compactSymbol', () => {
  it('renders options from the parsed contract, never the OCC string', async () => {
    const { compactSymbol } = await import('./holdings')
    expect(
      compactSymbol({
        ticker: 'NFLX180201C00355000',
        type: 'derivative',
        optionContract: { underlyingTicker: 'NFLX', contractType: 'call', strikePrice: 355 },
      }),
    ).toBe('NFLX 355C')
    expect(
      compactSymbol({
        ticker: 'SPY240119P00470000',
        type: 'derivative',
        optionContract: { underlyingTicker: 'SPY', contractType: 'put', strikePrice: 470.5 },
      }),
    ).toBe('SPY 470.5P')
  })

  it('degrades an unparsed OCC ticker to UNDERLYING OPT', async () => {
    const { compactSymbol } = await import('./holdings')
    expect(compactSymbol({ ticker: 'NFLX180201C00355000', type: 'derivative', optionContract: null })).toBe('NFLX OPT')
  })

  it('passes plain tickers through', async () => {
    const { compactSymbol } = await import('./holdings')
    expect(compactSymbol({ ticker: 'VTI', type: 'etf', optionContract: null })).toBe('VTI')
    expect(compactSymbol({ ticker: null, type: 'cash', optionContract: null })).toBeNull()
  })
})
