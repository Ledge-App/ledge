import { countsTowardTotals } from './totals'
import type { FeedItem } from './resolveFeed'
import type { YearMonth } from './filterByMonth'

// Stands in for "no category" wherever a segment needs an id. Deliberately not a valid category
// id, so it can never collide with a real one.
export const UNCATEGORIZED_ID = '__uncategorized__'
export const UNCATEGORIZED_NAME = 'Uncategorized'
export const UNCATEGORIZED_ICON = '❔'
export const UNCATEGORIZED_COLOR = '#A8A89C'

export interface DonutSegment {
  categoryId: string
  name: string
  icon: string
  color: string
  amount: number
  percentage: number
  transactionCount: number
}

export interface DayPoint {
  day: number
  amount: number
}

export function computeDonutSegments(
  feed: FeedItem[],
  amountByCategory: Map<string, number>,
  categories: Array<{ id: string; name: string; icon: string; color: string }>,
  total: number,
  mode: 'expense' | 'income',
): DonutSegment[] {
  if (total === 0) return []

  const countByCategory = new Map<string, number>()
  let uncategorizedCount = 0
  for (const item of feed) {
    if (!countsTowardTotals(item)) continue
    const net = item.netAmount ?? item.amount
    const isRelevant = mode === 'expense' ? net > 0 : net < 0
    if (!isRelevant) continue
    if (item.categoryId) {
      countByCategory.set(item.categoryId, (countByCategory.get(item.categoryId) ?? 0) + 1)
    } else {
      uncategorizedCount++
    }
  }

  const segments: DonutSegment[] = []
  let categorizedTotal = 0
  for (const cat of categories) {
    const amount = amountByCategory.get(cat.id)
    if (!amount || amount <= 0) continue
    categorizedTotal += amount
    segments.push({
      categoryId: cat.id,
      name: cat.name,
      icon: cat.icon,
      color: cat.color,
      amount,
      percentage: (amount / total) * 100,
      transactionCount: countByCategory.get(cat.id) ?? 0,
    })
  }

  const uncategorizedAmount = total - categorizedTotal
  if (uncategorizedAmount > 0.01) {
    segments.push({
      categoryId: UNCATEGORIZED_ID,
      name: UNCATEGORIZED_NAME,
      icon: UNCATEGORIZED_ICON,
      color: UNCATEGORIZED_COLOR,
      amount: uncategorizedAmount,
      percentage: (uncategorizedAmount / total) * 100,
      transactionCount: uncategorizedCount,
    })
  }

  return segments.sort((a, b) => b.amount - a.amount)
}

export interface MerchantTotal {
  name: string
  amount: number
  count: number
}

export function computeTopMerchants(
  feed: FeedItem[],
  mode: 'expense' | 'income',
  limit = 5,
): MerchantTotal[] {
  const byMerchant = new Map<string, { amount: number; count: number }>()
  for (const item of feed) {
    if (!countsTowardTotals(item)) continue
    const net = item.netAmount ?? item.amount
    const isRelevant = mode === 'expense' ? net > 0 : net < 0
    if (!isRelevant) continue
    const existing = byMerchant.get(item.merchantName) ?? { amount: 0, count: 0 }
    existing.amount += Math.abs(net)
    existing.count++
    byMerchant.set(item.merchantName, existing)
  }

  return Array.from(byMerchant.entries())
    .map(([name, { amount, count }]) => ({ name, amount, count }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit)
}

export function computeDailyPoints(feed: FeedItem[], month: YearMonth, mode: 'expense' | 'income'): DayPoint[] {
  const daysInMonth = new Date(month.year, month.month, 0).getDate()
  const today = new Date()
  const isCurrentMonth = month.year === today.getFullYear() && month.month === today.getMonth() + 1
  const maxDay = isCurrentMonth ? today.getDate() : daysInMonth

  const dailyAmounts = new Map<number, number>()
  for (const item of feed) {
    if (!countsTowardTotals(item)) continue
    const net = item.netAmount ?? item.amount
    const isRelevant = mode === 'expense' ? net > 0 : net < 0
    if (!isRelevant) continue
    const day = parseInt(item.date.split('-')[2], 10)
    if (day > maxDay) continue
    dailyAmounts.set(day, (dailyAmounts.get(day) ?? 0) + Math.abs(net))
  }

  const points: DayPoint[] = []
  for (let day = 1; day <= maxDay; day++) {
    points.push({ day, amount: dailyAmounts.get(day) ?? 0 })
  }
  return points
}
