// Single money-formatting helper for the whole app. Every amount renders with thousands
// grouping and exactly two decimals, and a negative sign goes OUTSIDE the currency symbol
// (-$100.00, never $-100.00). Pass a known-positive value for plain amounts (spent,
// budget, balance) or a signed value for feed amounts — both are handled here.
export function formatAmount(amount: number): string {
  const sign = amount < 0 ? '-' : ''
  return `${sign}$${Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// The stand-in for a hidden amount. Fixed-width regardless of the real value, so the
// magnitude of a balance can't be read off the length of its mask.
export const MASKED_AMOUNT = '$****'

export function formatMaskableAmount(amount: number, isMasked: boolean): string {
  return isMasked ? MASKED_AMOUNT : formatAmount(amount)
}

/**
 * Compact form for large amounts in dense layouts (holdings table): about four
 * significant characters — $39.36k, $151.1k, $1M, $2.5M. Below 10k the regular form is
 * used: cents matter for prices and short numbers already fit.
 */
export function formatCompactAmount(amount: number): string {
  const sign = amount < 0 ? '-' : ''
  const abs = Math.abs(amount)
  // Sub-dollar quotes (options, fractional crypto) keep up to four decimals so $0.011
  // doesn't collapse into $0.01 — market convention beats scientific notation here.
  if (abs > 0 && abs < 1) {
    const text = abs.toFixed(4).replace(/0+$/, '').padEnd(4, '0')
    return `${sign}$${text}`
  }
  if (abs < 10_000) return formatAmount(amount)
  const millions = abs >= 1_000_000
  const scaled = millions ? abs / 1_000_000 : abs / 1_000
  const text = scaled.toFixed(scaled >= 100 ? 1 : 2).replace(/\.?0+$/, '')
  return `${sign}$${text}${millions ? 'M' : 'k'}`
}

export function formatCompactMaskableAmount(amount: number, isMasked: boolean): string {
  return isMasked ? MASKED_AMOUNT : formatCompactAmount(amount)
}
