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


const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/**
 * How long ago an instant was, for freshness labels: "just now", "5 min ago", "3 days ago".
 *
 * Takes `now` as an argument rather than reading the clock, so callers re-render on their own
 * tick and the function stays testable without faking time.
 *
 * Null in and null out — an unfetched query has no timestamp, and "just now" would be a lie
 * about data that never arrived. A zero timestamp means the same thing (react-query's
 * dataUpdatedAt is 0 before the first successful fetch), so it is treated identically.
 *
 * A future timestamp reads as "just now": device clocks drift and a server timestamp can
 * legitimately lead the device, but "-3 min ago" is never the right thing to show a user.
 */
export function formatRelativeTime(timestamp: number | null, now: number): string | null {
  if (timestamp == null || timestamp === 0) return null
  const elapsed = now - timestamp
  if (elapsed < MINUTE_MS) return 'just now'
  if (elapsed < HOUR_MS) return `${Math.floor(elapsed / MINUTE_MS)} min ago`
  if (elapsed < DAY_MS) return `${Math.floor(elapsed / HOUR_MS)} hr ago`
  const days = Math.floor(elapsed / DAY_MS)
  return `${days} ${days === 1 ? 'day' : 'days'} ago`
}

/**
 * How stale an ISO 8601 instant is: "just now", "30 min ago", "2 days ago".
 *
 * A thin wrapper over formatRelativeTime that owns the parsing, so callers holding a
 * timestamp string never have to decide what a NaN parse should render. Null in, null out;
 * unparseable in, null out — a freshness label reading "Invalid Date" is worse than none.
 *
 * Date-only values ("2026-08-23") parse as UTC midnight per the ES spec, which is what makes
 * their age independent of the reader's timezone.
 */
export function formatRelativeIsoTime(isoDate: string | null, now: number): string | null {
  if (!isoDate) return null
  const timestamp = Date.parse(isoDate)
  if (Number.isNaN(timestamp)) return null
  return formatRelativeTime(timestamp, now)
}
