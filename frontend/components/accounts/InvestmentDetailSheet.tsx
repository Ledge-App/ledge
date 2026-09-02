import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { BottomSheet, useSheetScroll } from '@/components/ui/BottomSheet'
import { HoldingsHeatMap } from '@/components/accounts/HoldingsHeatMap'
import { DayGroupHeader } from '@/components/transactions/DayGroupHeader'
import { TransactionRow } from '@/components/transactions/TransactionRow'
import {
  TransactionEditorErrorBanner,
  useTransactionEditorActions,
} from '@/components/transactions/TransactionEditorProvider'
import { colors } from '@/constants/theme'
import { useHoldings } from '@/hooks/useHoldings'
import {
  assetClass,
  averageCost,
  columnWidth,
  formatGainPct,
  formatShares,
  holdingGain,
  holdingGainPct,
  holdingLabel,
  holdingsPricedAsOf,
  monogramText,
  performanceColor,
  sortHoldingsByValue,
} from '@/lib/accounts/holdings'
import { hexToRgba } from '@/constants/theme'
import { formatRelativeIsoTime } from '@/lib/format/date'
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

// Per-character advance for each text style in the numeric columns, in px. Sound only
// because those cells are monospace: every glyph is exactly this wide, so character count
// times advance IS the rendered width. See columnWidth's note on why proportional text
// must never be measured this way.
const CHAR_WIDTH = {
  /** font-mono at text-sm (14px). */
  cell: 8.4,
  /** font-mono at 10px — the "avg" subline under PRICE. */
  subCell: 6,
  /** font-sansMed at text-xs (12px). Proportional, but the headers are all-caps ASCII
   *  of known width, and over-measuring a header only adds slack. */
  header: 7,
} as const

// The numeric columns outgrew the screen once GAIN and GAIN% were added, so they scroll
// horizontally while the STOCK column stays pinned — a row of anonymous numbers with its
// name scrolled off is worse than no gain column at all. Scrolling is also what lets the
// columns size to their content instead of truncating: there is no width to compete for.
//
// Pinning costs a fixed row height: the two panes are separate view trees, so nothing but
// equal heights keeps row N on the left aligned with row N on the right. Both heights are
// asserted here rather than left to content, and both panes draw the same bottom border so
// the divider reads as one continuous line across the seam.
//
// The pinned pane is a fixed width, not content-sized: its name line is a scroller, and a
// ScrollView has no intrinsic width to size a parent from. Kept deliberately narrow — every
// pixel here is one the numbers don't get, and the name no longer needs the room now that it
// scrolls in place. Nothing is ellipsized; the full name is always reachable by dragging it.
const LABEL_WIDTH = 140
/** How often the "last refreshed" label re-reads the clock while the sheet is open. */
const FRESHNESS_TICK_MS = 30 * 1000
// Both label lines get an explicit line height. Left to platform defaults the symbol's line
// box and the name scroller's box each add their own slack, which stacked into a visible gap
// between the ticker and the company name. Pinning both is also what keeps every row exactly
// ROW_HEIGHT tall, which the pinned-pane alignment depends on.
const SYMBOL_LINE_HEIGHT = 17
/** Hugs the 12px name text — the ScrollView is the row's only unbounded box otherwise. */
const NAME_LINE_HEIGHT = 14
const ROW_HEIGHT = 56
const HEADER_HEIGHT = 28

// 24 months of transfers is a long list, and this one sits inside a ScrollView rather than a
// SectionList, so every row mounts eagerly whether or not it's scrolled to. Capped by DAY rather
// than by row so a day is never shown half-populated with a total that disagrees with the rows
// beneath it. Days arrive newest-first, so this keeps the recent ones the sheet is actually for.
const TRANSFER_DAY_LIMIT = 12

/**
 * One holding's cells, formatted exactly once. The same strings are measured to size the
 * columns and then rendered into them, so a column can never be sized from text that
 * differs from what lands in it.
 */
interface HoldingCells {
  holding: Holding
  shares: string
  price: string
  /** Null when the institution reported no basis to average. */
  avg: string | null
  value: string
  gain: string
  gainPct: string
  /** Shared by GAIN and GAIN%: both derive from value - basis, so they always agree in sign. */
  gainColor: string
}

function toCells(holding: Holding, isMasked: boolean): HoldingCells {
  const avg = averageCost(holding)
  const gain = holdingGain(holding)
  const gainPct = holdingGainPct(holding)
  return {
    holding,
    shares: formatShares(holding.quantity),
    price: holding.institutionPrice != null ? formatCompactMaskableAmount(holding.institutionPrice, isMasked) : '—',
    avg: avg != null ? `avg ${formatCompactMaskableAmount(avg, isMasked)}` : null,
    value: holding.institutionValue != null ? formatCompactMaskableAmount(holding.institutionValue, isMasked) : '—',
    // An explicit + so a gain reads as a gain; formatCompactAmount already signs losses.
    gain: gain != null ? `${gain > 0 ? '+' : ''}${formatCompactMaskableAmount(gain, isMasked)}` : '—',
    gainPct: formatGainPct(gainPct),
    gainColor: performanceColor(gainPct).base,
  }
}

const HEADERS = { shares: 'SHARES', price: 'PRICE', value: 'VALUE', gain: 'GAIN', gainPct: 'GAIN%' } as const

// Left-to-right order of the scrolling columns, declared once. The header and the body both
// render from this, so a reorder moves both together and they cannot drift apart.
//
// Performance leads: PRICE, GAIN and GAIN% are what the sheet is opened to check, and the
// pane starts scrolled to its left edge — so the columns that matter are the ones on screen
// before any swipe. VALUE and SHARES are reference figures and sit out at the end.
const COLUMN_ORDER = ['price', 'gain', 'gainPct', 'value', 'shares'] as const

/** Every numeric column sized to its own widest cell, header included. */
function measureColumns(rows: HoldingCells[]) {
  const column = (cells: string[], header: string, subCells: string[] = []) =>
    columnWidth([
      { cells, charWidth: CHAR_WIDTH.cell },
      { cells: subCells, charWidth: CHAR_WIDTH.subCell },
      { cells: [header], charWidth: CHAR_WIDTH.header },
    ])
  return {
    shares: column(rows.map((r) => r.shares), HEADERS.shares),
    price: column(rows.map((r) => r.price), HEADERS.price, rows.flatMap((r) => (r.avg ? [r.avg] : []))),
    value: column(rows.map((r) => r.value), HEADERS.value),
    gain: column(rows.map((r) => r.gain), HEADERS.gain),
    gainPct: column(rows.map((r) => r.gainPct), HEADERS.gainPct),
  }
}

type ColumnWidths = ReturnType<typeof measureColumns>

/** Pinned pane: identity only. Fixed height so it stays in step with its numbers on the right. */
function HoldingLabelCell({ holding }: { holding: Holding }) {
  const label = holdingLabel(holding)
  // Same scale as the heat map tile for this holding, so the icon IS its map color.
  const cls = assetClass(holding.type)
  return (
    <View className="flex-row items-center border-b pr-3" style={{ borderColor: colors.border, height: ROW_HEIGHT }}>
      {/* Plaid ships no security logos, so a stable monogram tile stands in. */}
      <View
        className="h-8 w-8 items-center justify-center rounded-full"
        style={{ backgroundColor: hexToRgba(cls.color, 0.18) }}
      >
        <Text className="font-sansSemi text-xs" style={{ color: cls.color }}>
          {monogramText(label)}
        </Text>
      </View>
      {/* Explicit height, so the 32px monogram and this block are two boxes of known size
            centered against each other — relying on line boxes to work out to the same total
            left the icon visibly low. justify-center keeps a name-less holding centered too. */}
      <View
        className="ml-2 flex-1 justify-center"
        style={{ height: SYMBOL_LINE_HEIGHT + NAME_LINE_HEIGHT }}
      >
        {/* The symbol identifies the row and is short enough to fit, so it stays put. */}
        <Text
          className="font-sansSemi text-sm text-textPrimary"
          style={{ lineHeight: SYMBOL_LINE_HEIGHT }}
          numberOfLines={1}
        >
          {label}
        </Text>
        {holding.ticker && holding.name ? (
          // The name scrolls inside its own line rather than ellipsizing, so a long one
          // ("Vanguard Total Stock Market Index Fund ETF Shares") stays fully readable
          // without widening the pane. Height is pinned because an unbounded ScrollView
          // would stretch the row and break alignment with the numbers pane.
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ height: NAME_LINE_HEIGHT }}>
            <Text className="font-sans text-xs text-textMuted" style={{ lineHeight: NAME_LINE_HEIGHT }}>
              {holding.name}
            </Text>
          </ScrollView>
        ) : null}
      </View>
    </View>
  )
}

/** Scrolling pane: every number for one holding, in the order COLUMN_ORDER declares. */
function HoldingNumbersRow({ cells, widths }: { cells: HoldingCells; widths: ColumnWidths }) {
  return (
    <View className="flex-row items-center border-b" style={{ borderColor: colors.border, height: ROW_HEIGHT }}>
      {COLUMN_ORDER.map((key) => {
        // GAIN and GAIN% carry the performance color; everything else is neutral. GAIN% is
        // unmasked on purpose — a ratio discloses no balance, and privacy mode is most
        // useful when it still answers "how is this doing".
        const isGain = key === 'gain' || key === 'gainPct'
        return (
          <View key={key} className="items-end" style={{ width: widths[key] }}>
            <Text className="font-mono text-sm" style={{ color: isGain ? cells.gainColor : colors.textPrimary }}>
              {cells[key]}
            </Text>
            {key === 'price' && cells.avg ? (
              <Text className="font-mono text-textMuted" style={{ fontSize: 10 }}>
                {cells.avg}
              </Text>
            ) : null}
          </View>
        )
      })}
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
  const [showRefreshInfo, setShowRefreshInfo] = useState(false)
  // The label is relative ("5 min ago"), so it goes stale on its own while the sheet sits
  // open. Ticking only while it's open keeps a closed sheet from holding a timer.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (account == null) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), FRESHNESS_TICK_MS)
    return () => clearInterval(timer)
  }, [account])
  const holdings = useHoldings(account ? { itemId: account.itemId, accountId: account.account_id } : null)
  const needsRelink = holdings.error?.message.includes('ADDITIONAL_CONSENT_REQUIRED') ?? false

  // Sorted and formatted once here rather than in the table below: the same strings are
  // measured to size the columns and then rendered into them.
  const rows = useMemo(
    () => sortHoldingsByValue(holdings.data ?? []).map((h) => toCells(h, isMasked)),
    [holdings.data, isMasked],
  )
  const widths = useMemo(() => measureColumns(rows), [rows])
  // Dated by when the INSTITUTION priced these holdings, not by when we fetched them. Our
  // fetch time would read "just now" over a portfolio the brokerage last repriced two days
  // ago, which is the opposite of what a freshness label is for.
  const asOfLabel = formatRelativeIsoTime(holdingsPricedAsOf(holdings.data ?? []), now)

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
        <Text className="font-display text-xl text-textPrimary">
          {formatMaskableAmount(account?.balances?.current ?? 0, isMasked)}
        </Text>
        {/* Hidden entirely when no holding carries a price date: a confident-looking "as of"
            over an unknown pricing time is the one genuinely misleading thing this label
            could say. */}
        {asOfLabel ? (
          <Pressable
            onPress={() => setShowRefreshInfo((shown) => !shown)}
            hitSlop={8}
            className="mt-1 flex-row items-center gap-1"
          >
            <Text className="font-sans text-xs text-textMuted">Updated {asOfLabel}</Text>
            <Ionicons name="information-circle-outline" size={13} color={colors.textMuted} />
          </Pressable>
        ) : null}
        {/* A Modal rather than inline text so the explanation reads as a tooltip and never
            reflows the sheet under the user's finger. Nested inside the sheet's own Modal,
            which RN allows; the backdrop dismisses it so there is no button to miss. */}
        <Modal
          visible={showRefreshInfo}
          transparent
          animationType="fade"
          onRequestClose={() => setShowRefreshInfo(false)}
        >
          <Pressable
            className="flex-1 items-center justify-center px-10"
            style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
            onPress={() => setShowRefreshInfo(false)}
          >
            <View className="w-full rounded-2xl p-5" style={{ backgroundColor: colors.surface }}>
              <Text className="font-sansSemi text-sm text-textPrimary">How often values update</Text>
              <Text className="mt-2 font-sans text-xs leading-5 text-textMuted">
                Plaid collects new values from your brokerage at least once every market day,
                usually after close. Markets are shut on weekends and holidays, so a value can be a
                few days old even right after a refresh.
              </Text>
            </View>
          </Pressable>
        </Modal>
      </View>

      <View className="px-5">
        <TransactionEditorErrorBanner />
      </View>

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

            {/* Two panes, one table. The pinned pane carries the STOCK header and every
                label; the ScrollView carries the numeric header AND every numeric row, which
                is what keeps the header locked to its columns — one scroll offset, no syncing
                code. Both panes emit rows from the same array, so order cannot drift. */}
            <View className="mt-4 flex-row">
              <View style={{ width: LABEL_WIDTH }}>
                <View
                  className="justify-end border-b pb-2"
                  style={{ borderColor: colors.borderStrong, height: HEADER_HEIGHT }}
                >
                  <Text className="font-sansMed text-xs text-textMuted">STOCK</Text>
                </View>
                {rows.map((cells) => (
                  <HoldingLabelCell key={cells.holding.securityId} holding={cells.holding} />
                ))}
              </View>

              {/* The sheet's drag-to-dismiss only claims a gesture when |dy| > |dx|, so a
                  sideways swipe here can never dismiss the sheet. */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-1">
                <View>
                  <View
                    className="flex-row items-end border-b pb-2"
                    style={{ borderColor: colors.borderStrong, height: HEADER_HEIGHT }}
                  >
                    {COLUMN_ORDER.map((key) => (
                      <Text
                        key={key}
                        className="text-right font-sansMed text-xs text-textMuted"
                        style={{ width: widths[key] }}
                      >
                        {HEADERS[key]}
                      </Text>
                    ))}
                  </View>
                  {rows.map((cells) => (
                    <HoldingNumbersRow key={cells.holding.securityId} cells={cells} widths={widths} />
                  ))}
                </View>
              </ScrollView>
            </View>
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
                on an older account it understates. No gain is derived from it for that reason:
                market value minus a windowed principal would report pre-window contributions as
                profit. The GAIN column above is a different quantity and safe — it comes from the
                institution's own reported cost basis, which has no window. */}
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
            <InvestmentTransferDays shownDays={shownDays} categoryById={categoryById} />
            {hiddenCount > 0 ? (
              <Text className="py-3 text-center font-sans text-xs text-textMuted">
                {hiddenCount} older {hiddenCount === 1 ? 'transfer' : 'transfers'} not shown
              </Text>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </BottomSheet>
  )
}

/**
 * The transfer rows, as their own component so they can read openTransaction from the provider's
 * context. The sheet body around them is created by InvestmentDetailSheet and therefore skipped
 * when the provider re-renders for an edit sheet; only this leaf subscribes.
 */
function InvestmentTransferDays({
  shownDays,
  categoryById,
}: {
  shownDays: { date: string; items: FeedItem[] }[]
  categoryById: Map<string, Category>
}) {
  const { openTransaction } = useTransactionEditorActions()
  return (
    <>
      {shownDays.map((day) => (
        <View key={day.date}>
          <DayGroupHeader date={day.date} items={day.items} />
          {day.items.map((item) => {
            const category = item.categoryId ? categoryById.get(item.categoryId) : undefined
            return (
              <View key={item.id} className="border-t" style={{ borderColor: colors.border }}>
                <TransactionRow
                  item={item}
                  categoryName={category?.name ?? 'Uncategorized'}
                  categoryColor={category?.color ?? colors.textMuted}
                  categoryIcon={category?.icon ?? null}
                  reimbursementCategoryName={
                    item.reimbursementCategoryId ? categoryById.get(item.reimbursementCategoryId)?.name ?? null : null
                  }
                  onPress={openTransaction}
                />
              </View>
            )
          })}
        </View>
      ))}
    </>
  )
}
