import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { BottomSheet, useSheetScroll } from '@/components/ui/BottomSheet'
import { colors, hexToRgba } from '@/constants/theme'
import { TRANSFER_TYPES } from '@/lib/transfers/registry'
import { formatAmount } from '@/lib/format/money'
import type { FeedItem } from '@/lib/transactions/resolveFeed'
import type { TransferSuggestion } from '@/hooks/useTransactionFeed'
import type { Account } from '@/types/domain'

// The medium-confidence tier of transfer auto-detection, surfaced as one-tap decisions.
// Collapsed to a single banner row on the transactions screen (rendered only when there is
// something to decide); the full list lives in a swipe-dismissable bottom sheet so several
// suggestions never crowd the screen. Confirming creates a normal manual-source transfer
// (the user vouched); dismissing records a transfer_dismissal so the pair never resurfaces.

/** Same compact form as the list's section headers (8/4), readable at a glance. */
function shortDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00`)
  return `${parsed.getMonth() + 1}/${parsed.getDate()}`
}

interface TransferSuggestionsBannerProps {
  count: number
  onPress: () => void
}

export function TransferSuggestionsBanner({ count, onPress }: TransferSuggestionsBannerProps) {
  if (count === 0) return null
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-2 rounded-xl bg-surface px-4 py-3"
    >
      <Ionicons name="sparkles-outline" size={16} color={colors.transfer} />
      <Text className="flex-1 font-sansMed text-base text-textPrimary">
        {count === 1 ? 'Possible transfer' : 'Possible transfers'}
      </Text>
      {/* Count as a notification-style badge — it reads as "N waiting" at a glance. Same
          token as the sparkles icon, so the whole banner speaks one color. */}
      <View
        className="items-center justify-center rounded-full px-1.5"
        style={{ backgroundColor: colors.transfer, minWidth: 20, height: 20 }}
      >
        <Text className="font-sansMed text-xs" style={{ color: colors.textInverse }}>
          {count}
        </Text>
      </View>
    </Pressable>
  )
}

interface TransferSuggestionsSheetProps {
  visible: boolean
  suggestions: TransferSuggestion[]
  accounts: Account[]
  onClose: () => void
  onConfirm: (suggestion: TransferSuggestion) => Promise<void>
  onDismiss: (suggestion: TransferSuggestion) => Promise<void>
}

export function TransferSuggestionsSheet({ visible, suggestions, accounts, onClose, onConfirm, onDismiss }: TransferSuggestionsSheetProps) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const sheetScroll = useSheetScroll()

  // Acting on the last suggestion leaves nothing to decide — close rather than show an
  // empty sheet.
  useEffect(() => {
    if (visible && suggestions.length === 0) onClose()
  }, [visible, suggestions.length, onClose])

  // Institution name + mask ("Bank of America ··0533") — the way people identify a card;
  // Plaid has no abbreviated institution form. Merchant string only as a last resort.
  function accountLabel(item: FeedItem): string {
    const account = accounts.find((a) => a.account_id === item.accountId)
    if (!account) return item.merchantName
    return account.mask ? `${account.institutionName} ··${account.mask}` : account.institutionName
  }

  async function act(suggestion: TransferSuggestion, action: (s: TransferSuggestion) => Promise<void>) {
    setBusyId(suggestion.expense.id)
    try {
      await action(suggestion)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} contentScroll={sheetScroll}>
      <View className="flex-row items-center justify-between px-5 py-3">
        <Pressable onPress={onClose} hitSlop={8}>
          <Ionicons name="close" size={22} color={colors.textSecondary} />
        </Pressable>
        <Text className="mx-3 flex-1 text-center font-display text-md text-textPrimary">
          {suggestions.length === 1 ? 'Possible transfer' : `Possible transfers (${suggestions.length})`}
        </Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView {...sheetScroll.scrollProps} className="px-5" contentContainerClassName="gap-5 pb-10">
        {suggestions.map((suggestion) => {
          const type = TRANSFER_TYPES[suggestion.kind]
          const busy = busyId === suggestion.expense.id
          return (
            <View key={`${suggestion.expense.id}:${suggestion.income.id}`} className="gap-3 border-b pb-5" style={{ borderColor: colors.border }}>
              {/* Entry-style row: from/to stacked on two lines so a long bank name never
                  hides the destination; amount and dates in the right column. */}
              <View className="flex-row items-center gap-3">
                <View className="h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: hexToRgba(type.color, 0.18) }}>
                  <Ionicons name={type.icon} size={18} color={type.color} />
                </View>
                <View className="flex-1 gap-1">
                  {/* Source above, destination below, arrow marking the direction — reads as
                      "money moved down the page". middle-ellipsis so a long institution name
                      never swallows the mask, the part that actually identifies the card. */}
                  <Text className="font-sansSemi text-base text-textPrimary" numberOfLines={1} ellipsizeMode="middle">
                    {accountLabel(suggestion.expense)}
                  </Text>
                  <Ionicons name="arrow-down" size={14} color={colors.textMuted} />
                  <Text className="font-sansSemi text-base text-textPrimary" numberOfLines={1} ellipsizeMode="middle">
                    {accountLabel(suggestion.income)}
                  </Text>
                </View>
                <View className="ml-3 items-end gap-0.5">
                  <Text className="font-mono text-base text-textPrimary">{formatAmount(suggestion.amount)}</Text>
                  <Text className="font-sans text-xs text-textSecondary">
                    {suggestion.expense.date === suggestion.income.date
                      ? shortDate(suggestion.expense.date)
                      : `${shortDate(suggestion.expense.date)} → ${shortDate(suggestion.income.date)}`}
                  </Text>
                </View>
              </View>

              <View className="flex-row items-center gap-2">
                <Pressable
                  disabled={busy}
                  onPress={() => act(suggestion, onConfirm)}
                  className="flex-1 items-center rounded-full px-3 py-2"
                  style={{ backgroundColor: busy ? hexToRgba(type.color, 0.4) : type.color }}
                >
                  {busy ? (
                    <ActivityIndicator size="small" color={colors.textInverse} />
                  ) : (
                    <Text className="font-sansMed text-sm" style={{ color: colors.textInverse }}>
                      Link as transfer
                    </Text>
                  )}
                </Pressable>
                <Pressable
                  disabled={busy}
                  onPress={() => act(suggestion, onDismiss)}
                  className="flex-1 items-center rounded-full border border-border px-3 py-2"
                >
                  <Text className="font-sansMed text-sm text-textSecondary">Not a transfer</Text>
                </Pressable>
              </View>
            </View>
          )
        })}
      </ScrollView>
    </BottomSheet>
  )
}
