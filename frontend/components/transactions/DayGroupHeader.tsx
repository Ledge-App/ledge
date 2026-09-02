import { memo } from 'react'
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
function DayGroupHeaderComponent({ date, items, className }: DayGroupHeaderProps) {
  const { income, expense } = dayTotals(items)
  const hasTotals = income > 0 || expense > 0

  return (
    <View className={className ?? 'flex-row items-center justify-between py-3'}>
      {/* Read here rather than passed in: threading a `now` prop through every list that renders a
          day header would churn five call sites to decide whether to print four characters, and
          this component is memoized on its props, so reading the clock does not add a render. */}
      <Text className="font-sansSemi text-sm text-textPrimary">{formatDayLabel(date, Date.now())}</Text>
      <View className="flex-row gap-3">
        {income > 0 ? <Text className="font-sans text-xs text-income">IN {formatAmount(income)}</Text> : null}
        {expense > 0 ? <Text className="font-sans text-xs text-expense">OUT {formatAmount(expense)}</Text> : null}
        {hasTotals ? null : <Text className="font-sans text-xs text-textMuted">{formatAmount(0)}</Text>}
      </View>
    </View>
  )
}

/** Memoized alongside the rows it heads: `items` is stable while the day's grouping is. */
export const DayGroupHeader = memo(DayGroupHeaderComponent)
