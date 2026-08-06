import { useMemo, useRef } from 'react'
import { Pressable, SectionList, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, hexToRgba } from '@/constants/theme'
import { formatAmount, formatMaskableAmount } from '@/lib/format/money'
import { useTransactionEditor } from '@/hooks/useTransactionEditor'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
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

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

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
  // Wired here rather than by the caller so every row this sheet shows is editable — a linked
  // account's Plaid rows open the category sheet, the built-in Cash row's manual rows open the
  // manual sheet — without each call site having to opt in.
  const editor = useTransactionEditor(feed)

  // The caller clears its selection the moment it closes the sheet, which would blank the
  // content out mid-animation. Holding the last open values keeps the exit readable.
  const lastShown = useRef({ title, balance, variant, items, emptyLabel })
  if (visible) lastShown.current = { title, balance, variant, items, emptyLabel }
  const shown = visible ? { title, balance, variant, items, emptyLabel } : lastShown.current

  const sections = useMemo(() => {
    const byDate = new Map<string, FeedItem[]>()
    for (const item of shown.items) {
      const bucket = byDate.get(item.date) ?? []
      bucket.push(item)
      byDate.set(item.date, bucket)
    }
    return Array.from(byDate.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([date, data]) => ({ title: date, data }))
  }, [shown.items])

  const icon = variantIcons[shown.variant] ?? variantIcons.cash
  const balanceColor = shown.variant === 'credit' ? colors.expense : colors.textPrimary

  return (
    <BottomSheet visible={visible} onClose={onClose}>
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
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 20 }}
        renderSectionHeader={({ section }) => {
          const date = new Date(section.title + 'T00:00:00')
          const dayOfWeek = DAY_NAMES[date.getDay()]
          const monthDay = `${date.getMonth() + 1}/${date.getDate()}`
          const incomeTotal = section.data.filter((i) => i.amount < 0 && !i.isReimbursementIncome).reduce((s, i) => s + Math.abs(i.netAmount ?? i.amount), 0)
          const expenseTotal = section.data.filter((i) => i.amount > 0).reduce((s, i) => s + (i.netAmount ?? i.amount), 0)
          return (
            <View className="flex-row items-center justify-between bg-surface pb-1 pt-3">
              <Text className="font-sansSemi text-sm text-textPrimary">{monthDay} {dayOfWeek}</Text>
              <View className="flex-row gap-3">
                {incomeTotal > 0 ? <Text className="font-sans text-xs text-income">IN {formatAmount(incomeTotal)}</Text> : null}
                {expenseTotal > 0 ? <Text className="font-sans text-xs text-expense">OUT {formatAmount(expenseTotal)}</Text> : null}
              </View>
            </View>
          )
        }}
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
