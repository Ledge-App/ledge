import type { Account } from '@/types/domain'

/**
 * Applies the user's saved display order.
 *
 * Accounts with no saved position keep their incoming order and sort AFTER every positioned
 * one. That is the safe direction: a newly linked account appears predictably at the bottom
 * of its group rather than silently landing in the middle of a list the user arranged.
 *
 * Positions are compared globally even though they're only meaningful within a group,
 * because callers sort a single group at a time — and where they don't, relative order
 * within each group still comes out right.
 *
 * Stable: `Array.prototype.sort` is required to be stable, so equal-position accounts (and
 * all unpositioned ones) hold the order they arrived in.
 */
export function sortAccountsByPreference<T extends { account_id: string }>(
  accounts: T[],
  positionByAccountId: Map<string, number>,
): T[] {
  return [...accounts].sort((a, b) => {
    const posA = positionByAccountId.get(a.account_id)
    const posB = positionByAccountId.get(b.account_id)
    if (posA == null && posB == null) return 0
    if (posA == null) return 1
    if (posB == null) return -1
    return posA - posB
  })
}

/**
 * Moves one item to a new index, returning a new array. Out-of-range indices are clamped
 * rather than rejected — a drag can overshoot the end of a list, and dropping past the last
 * row plainly means "put it last".
 */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (items.length === 0) return items
  const clamp = (i: number) => Math.max(0, Math.min(items.length - 1, i))
  const source = clamp(from)
  const target = clamp(to)
  if (source === target) return items
  const next = [...items]
  const [moved] = next.splice(source, 1)
  next.splice(target, 0, moved)
  return next
}

/** Positions keyed for lookup, from the flat rows the API returns. */
export function toPositionMap(orders: Array<{ accountId: string; position: number }>): Map<string, number> {
  return new Map(orders.map((o) => [o.accountId, o.position]))
}

/**
 * Folds one group's new order into the full saved list, for the optimistic cache write.
 *
 * Only the named accounts are repositioned; every other row is left exactly as it was,
 * because a reorder always concerns one group and the other groups' positions are still
 * correct. Mirrors what the server's upsert does, so the optimistic state and the
 * refetched state agree.
 */
export function applyGroupOrder(
  existing: Array<{ accountId: string; position: number }>,
  accountIds: string[],
): Array<{ accountId: string; position: number }> {
  const reordered = new Map(accountIds.map((accountId, position) => [accountId, position]))
  const untouched = existing.filter((o) => !reordered.has(o.accountId))
  return [...untouched, ...[...reordered].map(([accountId, position]) => ({ accountId, position }))]
}
