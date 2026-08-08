const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * A YYYY-MM-DD key written out for display: "Mon, Jul 20, 2026".
 *
 * Parsed as UTC and read back with getUTC*, so a transaction never shifts a day for a user west
 * of Greenwich — the key is a calendar date, not an instant. An unparseable key is returned as-is
 * rather than rendering "Invalid Date" at the top of a sheet.
 */
/**
 * The short form day headers use: "7/10 Fri". Same UTC handling as formatFullDate, for the same
 * reason — a calendar date must not shift under the user's timezone.
 */
export function formatDayLabel(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return dateKey
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()} ${DAY_NAMES[date.getUTCDay()]}`
}

export function formatFullDate(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return dateKey
  return `${DAY_NAMES[date.getUTCDay()]}, ${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`
}
