import { colors, hexToRgba } from '@/constants/theme'
import type { Holding } from '@/types/domain'

/**
 * Per-share average cost. Plaid's cost_basis is the TOTAL basis for the position, so this
 * is basis/quantity — null when the institution didn't report a basis (common for sweeps
 * and some brokerages) or the quantity is zero/negative (short positions aren't averaged).
 */
export function averageCost(holding: Holding): number | null {
  if (holding.costBasis == null || holding.quantity <= 0) return null
  return holding.costBasis / holding.quantity
}

/**
 * Compact symbol: options render from Plaid's parsed option_contract ("NFLX 355C") —
 * never the raw OCC string ("NFLX180201C00355000"). An unparsed OCC ticker degrades to
 * "NFLX OPT"; plain holdings keep their ticker.
 */
export function compactSymbol(holding: Pick<Holding, 'ticker' | 'type' | 'optionContract'>): string | null {
  const contract = holding.optionContract
  if (contract?.underlyingTicker) {
    const kind = contract.contractType?.charAt(0).toUpperCase() ?? ''
    return `${contract.underlyingTicker} ${formatShares(contract.strikePrice)}${kind}`
  }
  const occ = holding.ticker?.match(/^([A-Z]{1,6})\d{6}[CP]\d{8}$/)
  if (occ) return `${occ[1]} OPT`
  return holding.ticker
}

/** Display label: compact symbol when known, else security name, else a placeholder. */
export function holdingLabel(holding: Holding): string {
  return compactSymbol(holding) ?? holding.name ?? 'Unknown holding'
}

/**
 * Shares formatted for display across the whole range brokerages report:
 *  - huge counts compact like money (12.35k, 1M) — cash sweeps count "shares" in dollars;
 *  - whole numbers stay whole, normal fractions keep up to 4 decimals trimmed;
 *  - dust positions (< 0.0001) keep two significant digits instead of rounding to 0.
 */
export function formatShares(quantity: number): string {
  const abs = Math.abs(quantity)
  if (abs >= 10_000) {
    const millions = abs >= 1_000_000
    const scaled = millions ? quantity / 1_000_000 : quantity / 1_000
    const text = (Math.abs(scaled) >= 100 ? scaled.toFixed(1) : scaled.toFixed(2)).replace(/\.?0+$/, '')
    return `${text}${millions ? 'M' : 'k'}`
  }
  if (Number.isInteger(quantity)) return String(quantity)
  if (abs < 0.0001) {
    const text = quantity.toPrecision(2)
    return text.includes('e') ? quantity.toFixed(8).replace(/0+$/, '') : text
  }
  return quantity.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')
}

/** Total market value across holdings, for the sheet header sanity line. */
export function totalHoldingsValue(holdings: Holding[]): number {
  return holdings.reduce((sum, h) => sum + (h.institutionValue ?? 0), 0)
}

/** (value - total basis) / basis; null when the institution reports no usable basis. */
export function holdingGainPct(holding: Holding): number | null {
  if (holding.costBasis == null || holding.costBasis <= 0 || holding.institutionValue == null) return null
  return (holding.institutionValue - holding.costBasis) / holding.costBasis
}

/**
 * One performance color scale for the whole investments UI: the heat map tiles and the
 * table's monogram icons draw from the same function, so a holding keeps its color across
 * both. Green gain / red loss, deeper = larger move (saturating at +/-25%); neutral when
 * no basis is reported. `base` is for text/strokes, `fill` the translucent surface.
 */
export function performanceColor(gainPct: number | null): { base: string; fill: string } {
  if (gainPct == null) return { base: colors.textMuted, fill: colors.surfaceRaised }
  const base = gainPct >= 0 ? colors.income : colors.expense
  const alpha = 0.12 + Math.min(Math.abs(gainPct) / 0.25, 1) * 0.38
  return { base, fill: hexToRgba(base, alpha) }
}

/** 1-2 character monogram: "VTI" -> "VT", "Bitcoin" -> "BI". */
export function monogramText(label: string): string {
  return label.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || '?'
}

// --- Asset-class scale (allocation view) -------------------------------------------------
// The heat map colors by WHAT a holding is, never by performance: red/green on a treemap
// universally reads as "today's movement" (the finviz convention), which a vs-cost-basis
// tint would falsely imply. Class colors answer "what am I holding", size answers "how
// much" — nothing implies motion.

export interface AssetClass {
  key: string
  label: string
  color: string
  /** Tile text for holdings with no ticker ("U S Dollar" -> CASH). */
  shortLabel: string
}

const ASSET_CLASSES: Record<string, AssetClass> = {
  equity: { key: 'equity', label: 'Stocks', color: '#0E7490', shortLabel: 'STOCK' },
  etf: { key: 'etf', label: 'ETFs', color: '#0F766E', shortLabel: 'ETF' },
  'mutual fund': { key: 'mutual fund', label: 'Funds', color: '#7C3AED', shortLabel: 'FUND' },
  'fixed income': { key: 'fixed income', label: 'Bonds', color: '#B45309', shortLabel: 'BOND' },
  cash: { key: 'cash', label: 'Cash', color: '#6B7280', shortLabel: 'CASH' },
  cryptocurrency: { key: 'cryptocurrency', label: 'Crypto', color: '#BE185D', shortLabel: 'CRYPTO' },
  derivative: { key: 'derivative', label: 'Derivatives', color: '#4338CA', shortLabel: 'DERIV' },
}

const UNKNOWN_CLASS: AssetClass = { key: 'other', label: 'Other', color: '#71717A', shortLabel: 'OTHER' }

export function assetClass(type: string | null): AssetClass {
  return (type && ASSET_CLASSES[type]) || UNKNOWN_CLASS
}

/** Treemap tile text: the compact symbol when there is one, else the class short label. */
export function tileLabel(holding: Pick<Holding, 'ticker' | 'type' | 'optionContract'>): string {
  return compactSymbol(holding) ?? assetClass(holding.type).shortLabel
}

/**
 * Day move: latest institution price vs previous session close. Null when either side is
 * missing/zero — and beware staleness: some institutions update prices once a day, so a
 * zero here often means "not repriced yet", not "flat".
 */
export function dayChangePct(holding: Pick<Holding, 'institutionPrice' | 'closePrice'>): number | null {
  if (holding.institutionPrice == null || holding.closePrice == null || holding.closePrice <= 0) return null
  return (holding.institutionPrice - holding.closePrice) / holding.closePrice
}
