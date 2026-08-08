import { useMemo, useRef } from 'react'
import { Pressable, SectionList, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, hexToRgba } from '@/constants/theme'
import { formatMaskableAmount } from '@/lib/format/money'
import { groupByDay } from '@/lib/transactions/groupByDay'
import { useTransactionEditor } from '@/hooks/useTransactionEditor'
import { BottomSheet, useSheetScroll } from '@/components/ui/BottomSheet'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { DayGroupHeader } from '@/components/transactions/DayGroupHeader'
import { TransactionRow } from '@/components/transactions/TransactionRow'
import { TransactionEditSheets } from '@/components/transactions/TransactionEditSheets'
import type { FeedItem } from '@/lib/transactions/resolveFeed'
import type { Category } from '@/types/domain'

export type AccountDetailVariant = 'cash' | 'credit' | 'investment' | 'cashOnHand'

// Presentational rather than account-shaped, so the built-in Cash row — which has no Plaid
// account behind it, only manual transactions — can open the same sheet as a linked account.
interface AccountDetailSheetProps {
  visible: boolean
  title: string
  balance: number
  variant: AccountDetailVariant
  /** The rows to display — this row's slice of the feed, whichever way the caller sliced it. */
  items: FeedItem[]
  /** The whole feed. Editing needs context the displayed slice doesn't carry: reimbursement
   *  candidates can sit on any account, and the delete warning has to know whether a
   *  transaction is part of a reimbursement. */
  feed: FeedItem[]
  categoryById: Map<string, Category>
  isMasked: boolean
  onClose: () => void
  emptyLabel?: string
}

const variantIcons: Record<AccountDetailVariant, { name: string; color: string }> = {
  cash: { name: 'wallet', color: '#3B82F6' },
  investment: { name: 'trending-up', color: '#E11D48' },
  credit: { name: 'card', color: '#6B7280' },
  cashOnHand: { name: 'cash', color: colors.income },
}


export function AccountDetailSheet({
  visible,
  title,
  balance,
  variant,
  items,
  feed,
  categoryById,
  isMasked,
  onClose,
  emptyLabel = 'No transactions for this account',
}: AccountDetailSheetProps) {
  const insets = useSafeAreaInsets()
  const sheetScroll = useSheetScroll()
  // Wired here rather than by the caller so every row this sheet shows is editable — a linked
  // account's Plaid rows open the detail sheet, the built-in Cash row's manual rows open the
  // manual sheet — without each call site having to opt in.
  const editor = useTransactionEditor(feed)

  // The caller clears its selection the moment it closes the sheet, which would blank the
  // content out mid-animation. Holding the last open values keeps the exit readable.
  const lastShown = useRef({ title, balance, variant, items, emptyLabel })
  if (visible) lastShown.current = { title, balance, variant, items, emptyLabel }
  const shown = visible ? { title, balance, variant, items, emptyLabel } : lastShown.current

  // SectionList's own shape, mapped off the shared grouping so this sheet and the day-card lists
  // can't disagree about which day a row belongs to.
  const sections = useMemo(
    () => groupByDay(shown.items).map((day) => ({ title: day.date, data: day.items })),
    [shown.items],
  )

  const icon = variantIcons[shown.variant] ?? variantIcons.cash
  const balanceColor = shown.variant === 'credit' ? colors.expense : colors.textPrimary

  return (
    <BottomSheet visible={visible} onClose={onClose} contentScroll={sheetScroll}>
      <View className="flex-row items-center justify-between px-5 py-3">
        <Pressable onPress={onClose} hitSlop={8}>
          <Ionicons name="close" size={22} color={colors.textSecondary} />
        </Pressable>
        <Text className="flex-1 text-center font-display text-md text-textPrimary" numberOfLines={1}>{shown.title}</Text>
        <View style={{ width: 22 }} />
      </View>

      <View className="mx-5 mb-4 items-center rounded-xl p-5" style={{ backgroundColor: hexToRgba(icon.color, 0.08) }}>
        <View className="mb-3 h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: hexToRgba(icon.color, 0.18) }}>
          <Ionicons name={icon.name as any} size={24} color={icon.color} />
        </View>
        <Text className="font-display text-xl" style={{ color: balanceColor }}>
          {formatMaskableAmount(shown.balance, isMasked)}
        </Text>
      </View>

      {editor.saveError ? (
        <View className="px-5">
          <ErrorBanner message={editor.saveError} onDismiss={editor.dismissSaveError} />
        </View>
      ) : null}

      <Text className="mb-2 px-5 font-sansSemi text-sm text-textSecondary">Transactions</Text>

      <SectionList
        {...sheetScroll.scrollProps}
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 20 }}
        renderSectionHeader={({ section }) => (
          // Same header component the Transactions tab and the category sheet render, so all
          // three agree on what a day is worth — they previously each reduced the rows themselves.
          <DayGroupHeader
            date={section.title}
            items={section.data}
            className="flex-row items-center justify-between bg-surface pb-1 pt-3"
          />
        )}
        renderItem={({ item }) => {
          const category = item.categoryId ? categoryById.get(item.categoryId) : undefined
          return (
            <TransactionRow
              item={item}
              categoryName={category?.name ?? 'Uncategorized'}
              categoryColor={category?.color ?? colors.textMuted}
              categoryIcon={category?.icon ?? '❓'}
              reimbursementCategoryName={item.reimbursementCategoryId ? categoryById.get(item.reimbursementCategoryId)?.name ?? null : null}
              onPress={() => editor.openTransaction(item)}
            />
          )
        }}
        ListEmptyComponent={
          <Text className="py-8 text-center font-sans text-sm text-textMuted">{shown.emptyLabel}</Text>
        }
      />

      <TransactionEditSheets editor={editor} />
    </BottomSheet>
  )
}
