import { useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, shadow } from '@/constants/theme'
import { formatAmount } from '@/lib/format/money'
import { monthLabel } from '@/lib/transactions/filterByMonth'
import { computeNetWorthHistory, netWorthYearRange } from '@/lib/accounts/netWorthHistory'
import { NetWorthTrendChart } from './NetWorthTrendChart'
import { BottomSheet, useSheetScroll } from '@/components/ui/BottomSheet'
import type { FeedItem } from '@/lib/transactions/resolveFeed'
import type { Account } from '@/types/domain'

interface NetWorthTrendSheetProps {
  visible: boolean
  onClose: () => void
  netWorth: number
  accounts: Account[]
  feed: FeedItem[]
  isLoading: boolean
}

// Deliberately exempt from the app-wide `useAmountsMasked` toggle: this sheet exists to show
// the net worth trajectory, and a chart of masked amounts would have nothing left to say.
// Every other balance surface (HeroCard, AccountRow, AccountDetailSheet) does honour it.
function changeColor(change: number): string {
  if (change > 0) return colors.income
  if (change < 0) return colors.expense
  return colors.textMuted
}

function formatChange(change: number): string {
  return `${change > 0 ? '+' : ''}${formatAmount(change)}`
}

export function NetWorthTrendSheet({ visible, onClose, netWorth, accounts, feed, isLoading }: NetWorthTrendSheetProps) {
  const insets = useSafeAreaInsets()
  const sheetScroll = useSheetScroll()
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)

  // Reopening lands back on the current year rather than wherever the last visit left off.
  useEffect(() => {
    if (visible) setYear(currentYear)
  }, [visible, currentYear])

  const linkedAccountIds = useMemo(() => new Set(accounts.map((a) => a.account_id)), [accounts])

  const points = useMemo(
    () => computeNetWorthHistory(netWorth, feed, linkedAccountIds, year),
    [netWorth, feed, linkedAccountIds, year],
  )

  const range = useMemo(() => netWorthYearRange(feed, linkedAccountIds), [feed, linkedAccountIds])

  // Descending, matching how the balance list reads elsewhere in the app: newest first.
  const rows = useMemo(() => [...points].reverse(), [points])
  const latest = rows[0]

  return (
    <BottomSheet visible={visible} onClose={onClose} topOffset={insets.top + 20} contentScroll={sheetScroll}>
      <View className="flex-row items-center justify-between px-5 py-3">
        <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Close">
          <Ionicons name="close" size={22} color={colors.textSecondary} />
        </Pressable>
        <Text className="flex-1 text-center font-display text-md text-textPrimary">Net Worth Trend</Text>
        <View style={{ width: 22 }} />
      </View>

      <View className="flex-row items-center justify-center gap-4 pb-4">
        <Pressable
          onPress={() => setYear((y) => y - 1)}
          disabled={year <= range.first}
          hitSlop={8}
          accessibilityLabel="Previous year"
        >
          <Ionicons name="chevron-back" size={20} color={year <= range.first ? colors.border : colors.textSecondary} />
        </Pressable>
        <Text className="font-sansSemi text-base text-textPrimary">{year}</Text>
        <Pressable
          onPress={() => setYear((y) => y + 1)}
          disabled={year >= range.last}
          hitSlop={8}
          accessibilityLabel="Next year"
        >
          <Ionicons name="chevron-forward" size={20} color={year >= range.last ? colors.border : colors.textSecondary} />
        </Pressable>
      </View>

      <ScrollView {...sheetScroll.scrollProps} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }}>
        <View className="rounded-xl bg-surface p-3" style={shadow.card}>
          <View className="flex-row items-center justify-between px-1 pb-1">
            <Text className="font-sansSemi text-sm text-primary">Net Worth</Text>
            {latest ? (
              <Text className="font-sansSemi text-base" style={{ color: latest.netWorth < 0 ? colors.expense : colors.income }}>
                {formatAmount(latest.netWorth)}
              </Text>
            ) : null}
          </View>

          {isLoading && points.length === 0 ? (
            <View className="items-center py-20">
              <Text className="font-sans text-sm text-textMuted">Loading history…</Text>
            </View>
          ) : points.length === 0 ? (
            <View className="items-center py-20">
              <Text className="font-sans text-sm text-textMuted">No history for {year}</Text>
            </View>
          ) : (
            <NetWorthTrendChart points={points} />
          )}
        </View>

        {rows.length > 0 ? (
          <View className="mt-5 overflow-hidden rounded-xl bg-surface" style={shadow.card}>
            {rows.map((point, index) => (
              <View
                key={`${point.year}-${point.month}`}
                className="flex-row items-center justify-between px-4 py-4"
                style={index > 0 ? { borderTopWidth: 1, borderColor: colors.border } : undefined}
              >
                <Text className="font-sansMed text-base text-textPrimary">{monthLabel(point)}</Text>
                <View className="items-end">
                  <Text className="font-sansSemi text-base text-textPrimary">{formatAmount(point.netWorth)}</Text>
                  <Text className="font-sans text-xs" style={{ color: changeColor(point.change) }}>
                    {formatChange(point.change)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}

      </ScrollView>
    </BottomSheet>
  )
}
