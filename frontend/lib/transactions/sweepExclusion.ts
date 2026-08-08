import type { FeedItem } from './resolveFeed'

/**
 * Deliberately tighter than autoMatch's 7 days. A sweep is automatic and settles same-day or
 * next-day, so nothing legitimate needs the slack — and since this rule matches on amount alone,
 * every extra day of window is another chance to swallow a real purchase that merely happens to
 * equal a recent inflow. 1 day is the smallest window that still covers an overnight sweep.
 */
const SWEEP_WINDOW_DAYS = 1

/** Integer cents, so float amounts are safe as map keys. */
function centsKey(item: FeedItem): number {
  return Math.round(Math.abs(item.amount) * 100)
}

function daysBetween(a: string, b: string): number {
  const ms = Math.abs(new Date(a + 'T00:00:00').getTime() - new Date(b + 'T00:00:00').getTime())
  return Math.round(ms / 86_400_000)
}

/**
 * Marks brokerage-cash outflows that merely mirror an inflow of the exact same amount on the same
 * account — the sweep a cash management account performs when money lands in it.
 *
 * Why amount matching rather than the PFC code: the sweep's code varies by institution, and the
 * generic ones it tends to use (`TRANSFER_OUT_ACCOUNT_TRANSFER`) also cover real spending
 * elsewhere, so keying on the code is either institution-specific or unsafe. The mirrored amount
 * on the same account is the reliable signal.
 *
 * Why autoMatch can't do this: pairAllowed rejects same-account pairs outright, and lifting that
 * globally would let a salary deposit pair with an equal rent payment. Confining it to brokerage
 * cash accounts is what makes amount matching safe here.
 *
 * Deliberately asymmetric — only the outflow is marked. The inflow is frequently real income (a
 * dividend arriving, then swept), and excluding both legs the way a transfer does would erase it.
 *
 * MUST run last, after applyTransfers: an outflow autoMatch already paired is left alone, so this
 * can never contradict a transfer the user confirmed, undid, or that auto-applied.
 */
export function applySweepExclusion(feed: FeedItem[]): FeedItem[] {
  // Inflows are indexed even when they already belong to a transfer: money arriving from linked
  // checking is a legitimate transfer pair, and the sweep that follows it still needs excluding.
  const inflowsByAccountAmount = new Map<string, FeedItem[]>()
  for (const candidate of feed) {
    if (!candidate.isBrokerageCashAccount || !candidate.accountId) continue
    if (candidate.amount >= 0) continue
    const key = `${candidate.accountId}::${centsKey(candidate)}`
    const bucket = inflowsByAccountAmount.get(key)
    if (bucket) bucket.push(candidate)
    else inflowsByAccountAmount.set(key, [candidate])
  }

  // One inflow justifies dropping one outflow: two equal sweeps against a single inflow must not
  // both vanish, or spending is understated.
  const consumed = new Set<string>()

  return feed.map((item) => {
    if (!item.isBrokerageCashAccount || !item.accountId) return item
    if (item.amount <= 0) return item
    if (item.transferKind !== null) return item // autoMatch already decided this one

    const bucket = inflowsByAccountAmount.get(`${item.accountId}::${centsKey(item)}`) ?? []
    const match = bucket.find(
      (candidate) => !consumed.has(candidate.id) && daysBetween(item.date, candidate.date) <= SWEEP_WINDOW_DAYS,
    )
    if (!match) return item

    consumed.add(match.id)
    return { ...item, isSweptOutflow: true }
  })
}
