import { useEffect, useMemo, useRef, useState } from 'react'
import { Dimensions, Modal, Pressable, ScrollView, Text, View } from 'react-native'
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

  const linkedAccountIds = useMemo(() => new Set(accounts.map((a) => a.account_id)), [accounts])

  // One scope selector covers both readings of the line: a single year for the close-up,
  // 'all' for the long arc. Defaults to the current year, and re-seeds on every open so a
  // past visit's choice doesn't linger.
  const currentYear = new Date().getFullYear()
  const [scope, setScope] = useState<number | 'all'>(currentYear)
  useEffect(() => {
    if (visible) setScope(currentYear)
  }, [visible, currentYear])

  const range = useMemo(() => netWorthYearRange(feed, linkedAccountIds), [feed, linkedAccountIds])
  const scopeOptions = useMemo<Array<number | 'all'>>(() => {
    const years: Array<number | 'all'> = []
    for (let year = range.last; year >= range.first; year--) years.push(year)
    years.push('all')
    return years
  }, [range])

  const points = useMemo(
    () => computeNetWorthHistory(netWorth, feed, linkedAccountIds, scope === 'all' ? undefined : scope),
    [netWorth, feed, linkedAccountIds, scope],
  )

  // Anchored popover, matching the month/year picker on the Home and Details headers.
  const scopeLabelRef = useRef<View>(null)
  const [pickerAnchor, setPickerAnchor] = useState<{ left: number; top: number } | null>(null)
  const POPOVER_W = 150

  function openScopePicker() {
    scopeLabelRef.current?.measureInWindow((x, y, width, height) => {
      const screenWidth = Dimensions.get('window').width
      const centered = x + width / 2 - POPOVER_W / 2
      const left = Math.min(Math.max(centered, 12), screenWidth - POPOVER_W - 12)
      setPickerAnchor({ left, top: y + height + 8 })
    })
  }

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

      <View className="items-center pb-3">
        <Pressable
          ref={scopeLabelRef}
          onPress={openScopePicker}
          accessibilityLabel="Select year"
          hitSlop={8}
          className="flex-row items-center gap-1"
        >
          <Text className="font-sansSemi text-base text-textPrimary">{scope === 'all' ? 'All time' : scope}</Text>
          <Ionicons name="chevron-down" size={13} color={colors.textSecondary} />
        </Pressable>
      </View>

      <Modal transparent visible={pickerAnchor != null} animationType="fade" onRequestClose={() => setPickerAnchor(null)}>
        <Pressable style={{ flex: 1 }} onPress={() => setPickerAnchor(null)} accessibilityLabel="Dismiss year picker">
          {pickerAnchor ? (
            <Pressable
              onPress={() => {}}
              style={[
                {
                  position: 'absolute',
                  left: pickerAnchor.left,
                  top: pickerAnchor.top,
                  width: POPOVER_W,
                  backgroundColor: colors.surface,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: colors.border,
                  paddingVertical: 4,
                },
                shadow.md,
              ]}
            >
              {scopeOptions.map((option) => {
                const isSelected = option === scope
                return (
                  <Pressable
                    key={String(option)}
                    onPress={() => {
                      setScope(option)
                      setPickerAnchor(null)
                    }}
                    accessibilityLabel={option === 'all' ? 'All time' : `Year ${option}`}
                    className="flex-row items-center justify-between px-4 py-2.5"
                  >
                    <Text
                      className="font-sansMed text-base"
                      style={{ color: isSelected ? colors.primary : colors.textPrimary }}
                    >
                      {option === 'all' ? 'All time' : option}
                    </Text>
                    {isSelected ? <Ionicons name="checkmark" size={16} color={colors.primary} /> : null}
                  </Pressable>
                )
              })}
            </Pressable>
          ) : null}
        </Pressable>
      </Modal>

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
              <Text className="font-sans text-sm text-textMuted">{scope === 'all' ? 'No history yet' : `No history for ${scope}`}</Text>
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
