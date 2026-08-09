import { useMemo } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { BottomSheet, useSheetScroll } from '@/components/ui/BottomSheet'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { HoldingsHeatMap } from '@/components/accounts/HoldingsHeatMap'
import { DayGroupHeader } from '@/components/transactions/DayGroupHeader'
import { TransactionRow } from '@/components/transactions/TransactionRow'
import { TransactionEditSheets } from '@/components/transactions/TransactionEditSheets'
import { colors } from '@/constants/theme'
import { useHoldings } from '@/hooks/useHoldings'
import { useTransactionEditor } from '@/hooks/useTransactionEditor'
import { assetClass, averageCost, formatShares, holdingLabel, monogramText } from '@/lib/accounts/holdings'
import { hexToRgba } from '@/constants/theme'
import { formatCompactMaskableAmount, formatMaskableAmount } from '@/lib/format/money'
import { netPrincipal } from '@/lib/accounts/principal'
import { groupByDay } from '@/lib/transactions/groupByDay'
import type { FeedItem } from '@/lib/transactions/resolveFeed'
import type { Account, Category, Holding } from '@/types/domain'

interface InvestmentDetailSheetProps {
  account: Account | null
  /** This account's slice of the feed. Investment-source rows only reach here as cash transfers. */
  items: FeedItem[]
  /** The whole feed. Editing needs context the slice doesn't carry — reimbursement candidates can
   *  sit on any account, and the delete warning has to know about reimbursement membership. */
  feed: FeedItem[]
  categoryById: Map<string, Category>
  isMasked: boolean
  onClose: () => void
}

// Column widths shared by the header row and every body row so they stay aligned.
const COL = { shares: 52, price: 72, value: 84 } as const

// 24 months of transfers is a long list, and this one sits inside a ScrollView rather than a
// SectionList, so every row mounts eagerly whether or not it's scrolled to. Capped by DAY rather
// than by row so a day is never shown half-populated with a total that disagrees with the rows
// beneath it. Days arrive newest-first, so this keeps the recent ones the sheet is actually for.
const TRANSFER_DAY_LIMIT = 12

function HoldingRow({ holding, isMasked }: { holding: Holding; isMasked: boolean }) {
  const label = holdingLabel(holding)
  const avg = averageCost(holding)
  // Same scale as the heat map tile for this holding, so the icon IS its map color.
  const cls = assetClass(holding.type)
  return (
    <View className="flex-row items-center border-b py-3" style={{ borderColor: colors.border }}>
      <View className="flex-1 flex-row items-center gap-2 pr-2">
        {/* Plaid ships no security logos, so a stable monogram tile stands in. */}
        <View
          className="h-8 w-8 items-center justify-center rounded-full"
          style={{ backgroundColor: hexToRgba(cls.color, 0.18) }}
        >
          <Text className="font-sansSemi text-xs" style={{ color: cls.color }}>
            {monogramText(label)}
          </Text>
        </View>
        <View className="flex-1 gap-0.5">
          <Text className="font-sansSemi text-sm text-textPrimary" numberOfLines={1}>
            {label}
          </Text>
          {holding.ticker && holding.name ? (
            <Text className="font-sans text-xs text-textMuted" numberOfLines={1}>
              {holding.name}
            </Text>
          ) : null}
        </View>
      </View>
      <Text className="text-right font-mono text-sm text-textPrimary" style={{ width: COL.shares }} numberOfLines={1}>
        {formatShares(holding.quantity)}
      </Text>
      <View className="items-end" style={{ width: COL.price }}>
        <Text className="font-mono text-sm text-textPrimary" numberOfLines={1}>
          {holding.institutionPrice != null ? formatCompactMaskableAmount(holding.institutionPrice, isMasked) : '—'}
        </Text>
        {avg != null ? (
          <Text className="font-sans text-textMuted" style={{ fontSize: 10 }} numberOfLines={1}>
            avg {formatCompactMaskableAmount(avg, isMasked)}
          </Text>
        ) : null}
      </View>
      <Text className="text-right font-mono text-sm text-textPrimary" style={{ width: COL.value }} numberOfLines={1}>
        {holding.institutionValue != null ? formatCompactMaskableAmount(holding.institutionValue, isMasked) : '—'}
      </Text>
    </View>
  )
}

// Investment accounts get holdings ("what do I own") plus the cash that crossed the account's
// boundary ("what did I put in and take out"). Deliberately NOT the account's full activity:
// trades, fees and dividends are filtered out in the backend repository and never reach the
// client, because a buy is not household spending and one rebalance would swamp a month of it.
// The transfers shown here are exactly the rows autoMatch pairs against a linked checking
// account — which is the whole reason the investments product is read at all.
export function InvestmentDetailSheet({
  account,
  items,
  feed,
  categoryById,
  isMasked,
  onClose,
}: InvestmentDetailSheetProps) {
  const sheetScroll = useSheetScroll()
  const holdings = useHoldings(account ? { itemId: account.itemId, accountId: account.account_id } : null)
  const needsRelink = holdings.error?.message.includes('ADDITIONAL_CONSENT_REQUIRED') ?? false
  // Same editor the account and category sheets wire, so a transfer opens the same detail sheet
  // here as anywhere else — and that sheet is what names the transaction this one was matched
  // against. Nothing about matched-ness is re-implemented on this screen.
  const editor = useTransactionEditor(feed)

  // Capped by day, not by row: a partially-shown day would print an IN/OUT total covering rows
  // the user can't see.
  const days = useMemo(() => groupByDay(items), [items])
  const principal = useMemo(() => netPrincipal(items), [items])
  const shownDays = days.slice(0, TRANSFER_DAY_LIMIT)
  const hiddenCount = days.slice(TRANSFER_DAY_LIMIT).reduce((sum, day) => sum + day.items.length, 0)

  return (
    <BottomSheet visible={account != null} onClose={onClose} contentScroll={sheetScroll}>
      <View className="flex-row items-center justify-between px-5 py-3">
        <Pressable onPress={onClose} hitSlop={8}>
          <Ionicons name="close" size={22} color={colors.textSecondary} />
        </Pressable>
        <Text className="mx-3 flex-1 text-center font-display text-md text-textPrimary" numberOfLines={1}>
          {account?.name ?? ''}
        </Text>
        <View style={{ width: 22 }} />
      </View>

      <View className="items-center pb-4">
        <Text className="font-sans text-xs text-textMuted">Market value</Text>
        <Text className="font-display text-xl text-textPrimary">
          {formatMaskableAmount(account?.balances?.current ?? 0, isMasked)}
        </Text>
      </View>

      {editor.saveError ? (
        <View className="px-5">
          <ErrorBanner message={editor.saveError} onDismiss={editor.dismissSaveError} />
        </View>
      ) : null}

      <ScrollView {...sheetScroll.scrollProps} className="px-5" contentContainerClassName="pb-10">
        {holdings.isLoading ? (
          <View className="items-center py-8">
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : holdings.error ? (
          <Text className="py-8 text-center font-sans text-sm text-textMuted">
            {needsRelink
              ? 'This institution needs to be reconnected to share holdings. Remove and relink it from Settings → Institutions.'
              : "Couldn't load holdings for this account."}
          </Text>
        ) : (holdings.data?.length ?? 0) === 0 ? (
          // Covers the "nothing at all" case too: when activity is also empty this is the
          // sheet's only message, and it still reads correctly — there ARE no holdings.
          <Text className="py-8 text-center font-sans text-sm text-textMuted">No holdings in this account</Text>
        ) : (
          <>
            <HoldingsHeatMap holdings={holdings.data!} />

            {/* Header row mirrors the body's fixed column widths. */}
            <View className="mt-4 flex-row items-center border-b pb-2" style={{ borderColor: colors.borderStrong }}>
              <Text className="flex-1 font-sansMed text-xs text-textMuted">STOCK</Text>
              <Text className="text-right font-sansMed text-xs text-textMuted" style={{ width: COL.shares }}>
                SHARES
              </Text>
              <Text className="text-right font-sansMed text-xs text-textMuted" style={{ width: COL.price }}>
                PRICE
              </Text>
              <Text className="text-right font-sansMed text-xs text-textMuted" style={{ width: COL.value }}>
                VALUE
              </Text>
            </View>
            {holdings.data!.map((holding) => (
              <HoldingRow key={holding.securityId} holding={holding} isMasked={isMasked} />
            ))}
          </>
        )}

        {/* Sibling of the holdings conditional above, not nested inside its success branch:
            transfers come from the feed, independent of holdings' network loading/error/empty
            states — e.g. a fully-liquidated account has real transfers to show with zero
            current holdings.

            Same DayGroupHeader + TransactionRow the account and category sheets render, so a
            transfer greys out, badges "Transfer · Auto" and opens the same detail sheet here as
            everywhere else — none of which is re-implemented on this screen. */}
        {items.length > 0 ? (
          <>
            {/* Principal sits on the TRANSFERS row because it is the sum of exactly these rows —
                reading it beside the list it totals is what makes it self-explanatory.

                It covers only what the feed holds (~24 months from the investments endpoint), so
                on an older account it understates. That is why no gain is shown anywhere on this
                screen: market value minus a windowed principal would report pre-window
                contributions as profit. */}
            <View className="mb-1 mt-6 flex-row items-baseline justify-between">
              <Text className="font-sansMed text-xs text-textMuted">TRANSFERS</Text>
              {principal !== null ? (
                <Text className="font-sansSemi text-sm text-textPrimary">
                  {/* Magnitude plus a direction word, not a signed amount: an account being drawn
                      down nets out negative, and "-$3,000.00 in" reads as a typo where
                      "$3,000.00 out" reads as the fact it is. */}
                  {formatMaskableAmount(Math.abs(principal), isMasked)} {principal < 0 ? 'out' : 'in'}
                </Text>
              ) : null}
            </View>
            {shownDays.map((day) => (
              <View key={day.date}>
                <DayGroupHeader date={day.date} items={day.items} />
                {day.items.map((item) => (
                  <View key={item.id} className="border-t" style={{ borderColor: colors.border }}>
                    <TransactionRow
                      item={item}
                      categoryName={(item.categoryId ? categoryById.get(item.categoryId) : undefined)?.name ?? 'Uncategorized'}
                      categoryColor={(item.categoryId ? categoryById.get(item.categoryId) : undefined)?.color ?? colors.textMuted}
                      categoryIcon={(item.categoryId ? categoryById.get(item.categoryId) : undefined)?.icon ?? null}
                      reimbursementCategoryName={
                        item.reimbursementCategoryId ? categoryById.get(item.reimbursementCategoryId)?.name ?? null : null
                      }
                      onPress={() => editor.openTransaction(item)}
                    />
                  </View>
                ))}
              </View>
            ))}
            {hiddenCount > 0 ? (
              <Text className="py-3 text-center font-sans text-xs text-textMuted">
                {hiddenCount} older {hiddenCount === 1 ? 'transfer' : 'transfers'} not shown
              </Text>
            ) : null}
          </>
        ) : null}
      </ScrollView>

      <TransactionEditSheets editor={editor} />
    </BottomSheet>
  )
}
