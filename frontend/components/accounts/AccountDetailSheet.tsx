import { useCallback, useLayoutEffect, useMemo, useRef } from 'react'
import { Pressable, SectionList, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, hexToRgba } from '@/constants/theme'
import { appleIcon } from '@/components/accounts/AccountRow'
import { FINANCEKIT_ITEM_ID } from '@/lib/financekit/mergeAccounts'
import { formatMaskableAmount } from '@/lib/format/money'
import { groupByDay } from '@/lib/transactions/groupByDay'
// TEMPORARY DIAGNOSTIC — remove with lib/observability/devProbe.ts
import { probeLog, probeMark, probePhase } from '@/lib/observability/devProbe'
import { BottomSheet, useSheetScroll } from '@/components/ui/BottomSheet'
import type { SheetScroll } from '@/components/ui/BottomSheet'
import { DayGroupHeader } from '@/components/transactions/DayGroupHeader'
import { TransactionRow } from '@/components/transactions/TransactionRow'
import {
  TransactionEditorErrorBanner,
  useTransactionEditorActions,
} from '@/components/transactions/TransactionEditorProvider'
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
  /** The account's item. Only read to spot Apple accounts, which wear the Apple mark. */
  itemId?: string | null
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
  itemId,
}: AccountDetailSheetProps) {
  const sheetScroll = useSheetScroll()

  // The caller clears its selection the moment it closes the sheet, which would blank the
  // content out mid-animation. Holding the last open values keeps the exit readable.
  const lastShown = useRef({ title, balance, variant, items, emptyLabel, itemId })
  if (visible) lastShown.current = { title, balance, variant, items, emptyLabel, itemId }
  const shown = visible ? { title, balance, variant, items, emptyLabel, itemId } : lastShown.current

  return (
    <BottomSheet visible={visible} onClose={onClose} contentScroll={sheetScroll}>
      {/* No provider here: it is mounted once in the tabs layout. Nesting it inside this sheet put
          the edit sheet's Modal inside this Modal's subtree, which on iOS made touch delivery
          unrecoverable — see AuthedShell in (tabs)/_layout.tsx. */}
      <AccountDetailSheetBody
          shown={shown}
          categoryById={categoryById}
          isMasked={isMasked}
          sheetScroll={sheetScroll}
          onClose={onClose}
        />
    </BottomSheet>
  )
}

type ShownAccount = {
  title: string
  balance: number
  variant: AccountDetailSheetProps['variant']
  items: FeedItem[]
  emptyLabel: string
  itemId?: string | null
}

/**
 * The sheet's content, split out so it can be the provider's `children` — an element created by the
 * wrapper below, and so unchanged when the provider re-renders for an edit sheet. Without the split
 * this whole list re-rendered every time one of its rows was opened.
 */
function AccountDetailSheetBody({
  shown,
  categoryById,
  isMasked,
  sheetScroll,
  onClose,
}: {
  shown: ShownAccount
  categoryById: Map<string, Category>
  isMasked: boolean
  sheetScroll: SheetScroll
  onClose: () => void
}) {
  const insets = useSafeAreaInsets()
  // Wired here rather than by the caller so every row this sheet shows is editable — a linked
  // account's Plaid rows open the detail sheet, the built-in Cash row's manual rows open the
  // manual sheet — without each call site having to opt in.
  const { openTransaction, openNewManual } = useTransactionEditorActions()

  // SectionList's own shape, mapped off the shared grouping so this sheet and the day-card lists
  // can't disagree about which day a row belongs to.
  const sections = useMemo(() => {
    // TEMPORARY DIAGNOSTIC — remove with lib/observability/devProbe.ts. A recompute hands
    // SectionList an entirely new dataset, which is what resets its render window mid-scroll.
    const endSections = probeMark(`sections rebuild for ${shown.title} (${shown.items.length} rows)`)
    const next = groupByDay(shown.items).map((day) => ({ title: day.date, data: day.items }))
    endSections()
    // Section COUNT, not just row count. SectionList enables sticky headers on iOS by default, and
    // every section becomes a sticky index on the underlying ScrollView — a few hundred of those is
    // its own well-known cliff, and the row count alone hides how many there are.
    probeLog(`sections=${next.length} for ${shown.items.length} rows`)
    return next
  }, [shown.items])

  // TEMPORARY DIAGNOSTIC — remove with lib/observability/devProbe.ts. Splits the long gap between
  // 'host committed <Modal>' and 'host content laid out' into its two halves: everything up to this
  // mark is React reconciling the sheet's tree, everything after it is UIKit creating and measuring
  // the native views. Only one of those two is worth optimising, and the timeline cannot say which.
  useLayoutEffect(() => {
    probePhase('sheet body committed (React, pre-paint)')
  })

  // Hoisted out of the JSX for the same reason the Transactions tab hoists its callbacks: an inline
  // renderer hands DayGroupHeader and TransactionRow a fresh identity on every render and defeats
  // their memo.
  const renderSectionHeader = useCallback(
    ({ section }: { section: { title: string; data: FeedItem[] } }) => (
      // Same header component the Transactions tab and the category sheet render, so all
      // three agree on what a day is worth — they previously each reduced the rows themselves.
      <DayGroupHeader
        date={section.title}
        items={section.data}
        className="flex-row items-center justify-between bg-surface pb-1 pt-3"
      />
    ),
    [],
  )
  // TEMPORARY DIAGNOSTIC — remove with lib/observability/devProbe.ts.
  //
  // VirtualizedList does not render its window in one pass: it renders initialNumToRender cells and
  // then fills the rest in batches on FOLLOWING frames. With windowSize at its default of 21
  // viewports, that fill can run for many frames and every cell in it creates native views — on the
  // same UI thread the entrance animation is trying to use. Timestamping the curve is what says
  // whether cells are still landing while the sheet is animating, and how far in it goes.
  // Calls AND distinct rows, because the difference between them is the whole question. Equal
  // numbers mean each row is rendered once and the cost is mounting it. Calls far ahead of distinct
  // rows means the list is re-rendering cells it already has — churn, which would also explain why
  // each batch of ten costs more than the last.
  const cellCalls = useRef(0)
  const distinctCells = useRef(new Set<string>())
  // Fires 400ms after the LAST cell renders, so the total lands right after the fill ends instead of
  // on a fixed timer that keeps falling past the end of the captured log. This one line is the whole
  // question for windowSize: how many rows does the list mount before it stops?
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countCell = (id: string) => {
    cellCalls.current += 1
    distinctCells.current.add(id)
    if (cellCalls.current % 10 === 0) {
      probePhase(`SectionList renderItem calls=${cellCalls.current} distinct rows=${distinctCells.current.size}`)
    }
    if (settleTimer.current) clearTimeout(settleTimer.current)
    settleTimer.current = setTimeout(() => {
      probePhase(`SectionList FILL SETTLED — ${distinctCells.current.size} rows mounted, no cell for 400ms`)
    }, 400)
  }

  const renderItem = useCallback(
    ({ item }: { item: FeedItem }) => {
      countCell(item.id)
      const category = item.categoryId ? categoryById.get(item.categoryId) : undefined
      return (
        <TransactionRow
          item={item}
          categoryName={category?.name ?? 'Uncategorized'}
          categoryColor={category?.color ?? colors.textMuted}
          categoryIcon={category?.icon ?? null}
          reimbursementCategoryName={item.reimbursementCategoryId ? categoryById.get(item.reimbursementCategoryId)?.name ?? null : null}
          onPress={openTransaction}
        />
      )
    },
    [categoryById, openTransaction],
  )

  // Tint and glyph come apart for Apple accounts: the card keeps the wash its KIND earns — grey
  // for a card, blue for cash — while the glyph becomes the Apple mark. Tinting from the mark's own
  // colour instead would wash the whole card in the text colour.
  const tint = variantIcons[shown.variant] ?? variantIcons.cash
  const icon = shown.itemId === FINANCEKIT_ITEM_ID ? appleIcon : tint
  const balanceColor = shown.variant === 'credit' ? colors.expense : colors.textPrimary

  return (
    <>
      <View className="flex-row items-center justify-between px-5 py-3">
        <Pressable onPress={onClose} hitSlop={8}>
          <Ionicons name="close" size={22} color={colors.textSecondary} />
        </Pressable>
        <Text className="flex-1 text-center font-display text-md text-textPrimary" numberOfLines={1}>{shown.title}</Text>
        {/* Only the built-in Cash row can take new entries here — it's backed by manual
            transactions. A Plaid account's history comes from the bank alone. */}
        {shown.variant === 'cashOnHand' ? (
          <Pressable onPress={openNewManual} accessibilityLabel="Add cash transaction" hitSlop={8}>
            <Ionicons name="add-circle-outline" size={22} color={colors.textPrimary} />
          </Pressable>
        ) : (
          <View style={{ width: 22 }} />
        )}
      </View>

      <View className="mx-5 mb-4 items-center rounded-xl p-5" style={{ backgroundColor: hexToRgba(tint.color, 0.08) }}>
        <View className="mb-3 h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: hexToRgba(tint.color, 0.18) }}>
          <Ionicons name={icon.name as any} size={24} color={icon.color} />
        </View>
        <Text className="font-display text-xl" style={{ color: balanceColor }}>
          {formatMaskableAmount(shown.balance, isMasked)}
        </Text>
      </View>

      <View className="px-5">
        <TransactionEditorErrorBanner />
      </View>

      <Text className="mb-2 px-5 font-sansSemi text-sm text-textSecondary">Transactions</Text>

      <SectionList
        {...sheetScroll.scrollProps}
        // TEMPORARY DIAGNOSTIC — remove with lib/observability/devProbe.ts. The list is the
        // expensive child; this says when IT is measured, as opposed to the sheet chrome above it.
        // The height is the whole diagnosis. A VirtualizedList decides its render window as
        // windowSize x THIS number, so a list that measures its own height as its CONTENT height
        // has a window covering every row and virtualizes nothing — which is what a windowSize of 5
        // failing to bind, and 600 rows mounting over 82 seconds, both look like. A bounded list in
        // this sheet should measure a few hundred px; anything in the thousands is the bug.
        onLayout={(event) =>
          probePhase(`SectionList laid out height=${Math.round(event.nativeEvent.layout.height)}px`)
        }
        sections={sections}
        // Sticky headers OFF. groupByDay turns 696 card transactions into 344 sections — barely two
        // rows a day — and on iOS SectionList makes every one of them a sticky index on the
        // underlying ScrollView, which re-evaluates the whole set as each new one mounts. That is
        // quadratic in the section count, and it matches what the sheet does: every batch of rows
        // slower than the one before, the JS thread blocked for seven seconds straight, and a fill
        // that never settles.
        //
        // Nothing else here is tuned. windowSize/maxToRenderPerBatch were tried first and did not
        // bind at all — the list has a 482px viewport and a correctly measured 19,678px content and
        // renders rows 19,000px below the fold regardless — so they are back at their defaults
        // rather than left in as decoration.
        stickySectionHeadersEnabled={false}
        // Decisive: a VirtualizedList fills its window using MEASURED cell heights. If cells report
        // no height, the 2410px window (5 x 482px) is never satisfied and the list keeps asking for
        // rows forever — which is what 600 rows on a bounded 482px viewport looks like. Content
        // height tracking the row count (~64px each) means measurement works and the fault is
        // elsewhere; content height staying flat means this is it.
        onContentSizeChange={(width, height) =>
          probePhase(`SectionList content size ${Math.round(width)}x${Math.round(height)}px`)
        }
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 20 }}
        renderSectionHeader={renderSectionHeader}
        renderItem={renderItem}
        ListEmptyComponent={
          <Text className="py-8 text-center font-sans text-sm text-textMuted">{shown.emptyLabel}</Text>
        }
      />
    </>
  )
}
