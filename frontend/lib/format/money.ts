// Single money-formatting helper for the whole app. Every amount renders with thousands
// grouping and exactly two decimals, and a negative sign goes OUTSIDE the currency symbol
// (-$100.00, never $-100.00). Pass a known-positive value for plain amounts (spent,
// budget, balance) or a signed value for feed amounts — both are handled here.
export function formatAmount(amount: number): string {
  const sign = amount < 0 ? '-' : ''
  return `${sign}$${Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
