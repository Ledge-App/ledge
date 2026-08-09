import type { InvestmentTransaction } from '@/types/domain'

/**
 * 24 months expressed in days. Day-count arithmetic rather than setUTCMonth: subtracting
 * calendar months normalizes Feb 29 forward to Mar 1, silently shortening the window.
 * 730 = 2 x 365, so a window containing a leap day reaches back 730 days but covers only
 * 2 years minus a day of calendar time (two full calendar years there being 731 days). That
 * is within the tolerance of "roughly two years of history" that Plaid serves anyway.
 */
export const BACKFILL_DAYS = 730

/**
 * How far back each subsequent fetch reaches. /investments/transactions/get has no cursor, so
 * incremental sync is a rolling window rather than a delta — 30 days comfortably covers rows an
 * institution posts late, and the merge is keyed by id so re-fetching costs nothing but bytes.
 */
export const OVERLAP_DAYS = 30

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function daysBetween(a: string, b: string): number {
  const ms = Math.abs(new Date(a + 'T00:00:00Z').getTime() - new Date(b + 'T00:00:00Z').getTime())
  return Math.round(ms / 86_400_000)
}

/**
 * The date range to request for one item.
 *
 * Falls back to a full backfill whenever the last successful fetch is older than the overlap
 * window — an app left unopened for two months would otherwise fetch only the last 30 days and
 * leave a permanent hole no later sync ever revisits.
 */
export function fetchWindow(today: Date, backfilledThrough: string | undefined): { startDate: string; endDate: string } {
  const endDate = toIsoDate(today)

  if (backfilledThrough && daysBetween(endDate, backfilledThrough) <= OVERLAP_DAYS) {
    const start = new Date(today)
    start.setUTCDate(start.getUTCDate() - OVERLAP_DAYS)
    return { startDate: toIsoDate(start), endDate }
  }

  const start = new Date(today)
  start.setUTCDate(start.getUTCDate() - BACKFILL_DAYS)
  return { startDate: toIsoDate(start), endDate }
}

/**
 * How many consecutive failed fetches an item tolerates, with no successful backfill ever
 * recorded, before this module stops treating it as needing the full 24-month window.
 *
 * Without this cap, an item whose institution simply doesn't support investments (a plain
 * checking account, PRODUCTS_NOT_SUPPORTED) never gets `backfilledThrough` written, so
 * `fetchWindow` returns a fresh 730-day window for it on every mount — forever. Because the
 * caller requests one shared window sized to the widest any item needs, that permanently-wide
 * item drags every other item's request back up to 730 days too. A few retries first, though:
 * an item can fail transiently (a rate limit, a momentary PRODUCT_NOT_READY while an async
 * extraction runs) and genuinely does still need the full backfill next time.
 */
export const MAX_FAILED_ATTEMPTS_BEFORE_NARROWING = 3

/**
 * Per-item state needed to size the shared fetch window: whether it has ever completed a
 * backfill, and how many consecutive fetches it has failed since.
 */
export interface ItemFetchState {
  backfilledThrough: string | undefined
  failedAttempts: number
}

/**
 * The one date range to request across every linked item this pass: the widest window any
 * single item needs, per `fetchWindow` above, with one exception — an item that has never
 * backfilled and has failed `MAX_FAILED_ATTEMPTS_BEFORE_NARROWING` times in a row is treated
 * as if it had just backfilled through today, so it degrades to the 30-day overlap window
 * instead of continuing to demand (and drag every other item into) a 24-month one. A single
 * successful fetch, or too few consecutive failures, does not trigger this — see
 * MAX_FAILED_ATTEMPTS_BEFORE_NARROWING's comment.
 *
 * Returns null for an empty item list, mirroring `window` being unset when there is nothing
 * to fetch for.
 */
export function selectFetchWindow(items: ItemFetchState[], today: Date): { startDate: string; endDate: string } | null {
  const endDate = toIsoDate(today)
  const startDate = items.reduce<string | null>((widest, item) => {
    const effectiveBackfilledThrough =
      !item.backfilledThrough && item.failedAttempts >= MAX_FAILED_ATTEMPTS_BEFORE_NARROWING
        ? endDate
        : item.backfilledThrough
    const itemWindow = fetchWindow(today, effectiveBackfilledThrough)
    return widest === null || itemWindow.startDate < widest ? itemWindow.startDate : widest
  }, null)
  return startDate ? { startDate, endDate } : null
}

/**
 * Whether the batch window actually sent to Plaid covered this item's TRUE need — i.e. the
 * window `fetchWindow` would have picked for this item alone, using its real
 * `backfilledThrough` and ignoring `selectFetchWindow`'s narrowing override.
 *
 * This is the piece that keeps the narrowing above safe. `selectFetchWindow` may narrow a
 * never-backfilled, persistently-failing item's own contribution to the batch window down to
 * the 30-day overlap. If that narrowed request then succeeds, the rows it got back are real
 * but incomplete — only the last 30 days, not the full 24 months this item has never actually
 * received. The caller must NOT advance this item's `backfilledThrough` on that success: doing
 * so would permanently mark it as backfilled while ~23 months of its history were silently
 * never requested. Comparing the sent window's `startDate` against this item's true need is
 * how the caller tells the two cases apart — a successful item whose true need the batch window
 * already covered (the common case) is unaffected, since the batch window is always at least as
 * wide as every unnarrowed item's own window (`selectFetchWindow` takes the widest).
 *
 * `today` is derived from `window.endDate` rather than taken as a separate parameter — the two
 * must agree (the batch window and this item's true window have to be measured from the same
 * "now"), and reconstructing it here removes the chance of a caller passing a different Date.
 *
 * Takes `backfilledThrough` directly rather than a full `ItemFetchState` — `failedAttempts` is
 * exactly what this function must ignore (that's `selectFetchWindow`'s narrowing input, not
 * this item's true need), so it isn't in the signature to be accidentally used.
 */
export function isWindowSufficient(
  backfilledThrough: string | undefined,
  window: { startDate: string; endDate: string },
): boolean {
  const today = new Date(`${window.endDate}T00:00:00Z`)
  const trueWindow = fetchWindow(today, backfilledThrough)
  return window.startDate <= trueWindow.startDate
}

/**
 * Inputs `resolveItemOutcome` needs to decide what one item's slot in an `onSuccess` handler
 * should do: whether that item failed this round, its state going into the fetch, and the
 * batch window that was actually sent.
 */
export interface ItemOutcomeInput {
  /** Whether this item's id appears in this fetch's `itemErrors`. */
  failed: boolean
  /** This item's `backfilledThrough` from BEFORE this fetch. */
  backfilledThrough: string | undefined
  /** This item's consecutive-failure count from BEFORE this fetch. */
  failedAttempts: number
  /** The window `selectFetchWindow` chose and that was actually sent for this batch. */
  fetchRange: { startDate: string; endDate: string }
}

/**
 * What a caller (the hook's `onSuccess`) should do for one item, having fetched `fetchRange`
 * and learned whether that item failed.
 */
export interface ItemOutcome {
  /** Merge this item's returned rows into its cache. False only when the item failed. */
  cacheRows: boolean
  /** Advance this item's `backfilledThrough` to `fetchRange.endDate`. */
  advanceMarker: boolean
  /** What to persist as this item's new consecutive-failure count. */
  nextFailedAttempts: number
}

/**
 * The single place that decides all three of an item's `onSuccess` writes, so the hook has no
 * decision logic of its own left to get wrong — it only iterates items, calls this, and
 * performs whatever it returns.
 *
 * A failed item: never caches (there's nothing to cache), never advances (a failed item must
 * re-cover the same range next time), and its failure count increments.
 *
 * A successful item: always caches — the rows it returned are real, and the merge is additive,
 * so caching a narrowed request's smaller row set loses nothing already held. Its failure count
 * always resets to 0, regardless of whether the request was narrowed — see `isWindowSufficient`'s
 * comment for why the counter and the marker are allowed to diverge here (the counter resetting
 * is safe on its own; it's `advanceMarker` gated by `isWindowSufficient` that prevents the data
 * hole, not the counter). Its marker advances only when `isWindowSufficient` confirms the batch
 * window that was actually sent covered what this item truly needed — NOT unconditionally on
 * success, which is exactly the bug this function exists to make impossible to reintroduce by
 * accident: every branch lives here, once, under test.
 */
export function resolveItemOutcome(input: ItemOutcomeInput): ItemOutcome {
  if (input.failed) {
    return { cacheRows: false, advanceMarker: false, nextFailedAttempts: input.failedAttempts + 1 }
  }
  return {
    cacheRows: true,
    advanceMarker: isWindowSufficient(input.backfilledThrough, input.fetchRange),
    nextFailedAttempts: 0,
  }
}

/**
 * Folds a freshly fetched window into the cache, newest first.
 *
 * Incoming wins on id collision (an institution may correct an amount or a date), and cached
 * rows outside the incoming window survive — that is what makes a 30-day fetch safe to run
 * against a 24-month cache.
 */
export function mergeInvestmentTransactions(
  cached: InvestmentTransaction[],
  incoming: InvestmentTransaction[],
): InvestmentTransaction[] {
  const byId = new Map(cached.map((t) => [t.investmentTransactionId, t]))
  for (const txn of incoming) byId.set(txn.investmentTransactionId, txn)
  return Array.from(byId.values()).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}
