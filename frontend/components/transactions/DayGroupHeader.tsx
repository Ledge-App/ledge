import { Text, View } from 'react-native'
import { formatAmount } from '@/lib/format/money'
import { formatDayLabel } from '@/lib/format/date'
import { dayTotals } from '@/lib/transactions/dayTotals'
import type { FeedItem } from '@/lib/transactions/resolveFeed'

interface DayGroupHeaderProps {
  date: string
  /** Every row under this header, excluded ones included — dayTotals decides what counts. */
  items: FeedItem[]
  /** Container classes, so a sticky SectionList header and a card header can share the markup. */
  className?: string
}

/**
 * One day's header: the date on the left, its IN/OUT split on the right. The single place this
 * markup lives, so the Transactions tab, the account sheet and the category sheet can't drift
 * apart on what a day is worth — the category sheet previously showed one combined magnitude in
 * permanent grey, which read as "excluded" even on days that counted in full.
 *
 * A day where nothing counts shows a muted $0.00 rather than nothing at all: the rows are still
 * listed below (greyed, badged), and a blank header left it ambiguous whether they'd been counted.
 */
export function DayGroupHeader({ date, items, className }: DayGroupHeaderProps) {
  const { income, expense } = dayTotals(items)
  const hasTotals = income > 0 || expense > 0

  return (
    <View className={className ?? 'flex-row items-center justify-between py-3'}>
      <Text className="font-sansSemi text-sm text-textPrimary">{formatDayLabel(date)}</Text>
      <View className="flex-row gap-3">
        {income > 0 ? <Text className="font-sans text-xs text-income">IN {formatAmount(income)}</Text> : null}
        {expense > 0 ? <Text className="font-sans text-xs text-expense">OUT {formatAmount(expense)}</Text> : null}
        {hasTotals ? null : <Text className="font-sans text-xs text-textMuted">{formatAmount(0)}</Text>}
      </View>
    </View>
  )
}
