import { useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { assetClassColors, liabilityColors } from '@/constants/theme'
import { TreemapTile } from '@/components/accounts/TreemapTile'
import { AccountGlyph } from '@/components/accounts/AccountGlyph'
import { variantIcons } from '@/components/accounts/AccountRow'
import { CASH_ON_HAND_KEY, computeNetWorthComposition, layoutComposition } from '@/lib/accounts/composition'
import { formatAmount } from '@/lib/format/money'
import type { Account } from '@/types/domain'
import type { FeedItem } from '@/lib/transactions/resolveFeed'

/**
 * Fixed. The map does not grow to accommodate small tiles: areas are true, so a tiny holding
 * is a tiny tile, and tapping is how it says what it is.
 */
const MAP_HEIGHT = 200
/**
 * Stand-in glyph when Plaid has no logo for an institution, or the row has no institution at
 * all. Mirrors the accounts list's own fallbacks so the same account looks the same on both.
 */
function fallbackIconFor(groupKey: string, accountKey: string) {
  if (accountKey === CASH_ON_HAND_KEY) return variantIcons.cashOnHand
  if (groupKey === 'investment') return variantIcons.investment
  if (groupKey === 'liability') return variantIcons.credit
  return variantIcons.cash
}
const ACCOUNT_TINT_MAX = 0.4
const ACCOUNT_TINT_STEP = 0.06
const ACCOUNT_TINT_MIN = 0.22

// Cash and Investments borrow the holdings map's own scale rather than introducing another
// palette — the two maps sit two taps apart and should read as one visual language. Debt is
// the deliberate exception: it gets rose, because owing money is a different KIND of thing
// from owning it and colour is the only place that can be said.
const GROUP_COLORS = {
  cash: assetClassColors.cash,
  investment: assetClassColors.equity,
  liability: liabilityColors,
} as const

/**
 * What today's net worth is made of: asset groups, the accounts inside them, and the debt
 * held against the whole thing.
 *
 * ASSETS only in the map. Net worth is assets minus liabilities, so debt contributes negative
 * share and cannot be a tile — see composition.ts. The bar underneath measures debt against
 * the same total the map draws, which is what keeps the two comparable.
 */
export function NetWorthCompositionMap({ accounts, feed }: { accounts: Account[]; feed: FeedItem[] }) {
  const [width, setWidth] = useState(0)
  // Which tile the user tapped. A treemap can only label the tiles with room for a label, so
  // tapping is how the small ones say what they are — without it a 1% account is an anonymous
  // square.
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const { groups, legend } = useMemo(() => computeNetWorthComposition(accounts, feed), [accounts, feed])
  const { layouts, height: mapHeight } = useMemo(
    () => (width > 0 ? layoutComposition(groups, width, MAP_HEIGHT) : { layouts: [], height: MAP_HEIGHT }),
    [groups, width],
  )

  if (groups.length === 0) return null
  const selectedEntry = groups
    .flatMap((g) => g.accounts.map((account) => ({ account, groupKey: g.key })))
    .find(({ account }) => account.key === selectedKey)
  const selected = selectedEntry?.account ?? null
  const selectedIcon = selectedEntry
    ? fallbackIconFor(selectedEntry.account.isLiability ? 'liability' : selectedEntry.groupKey, selectedEntry.account.key)
    : null

  return (
    <View className="gap-2">
      {/* Group names live OUT here rather than inside their rects, so the children can fill
          their parent completely. The swatch is what ties a label to its block. */}
      {/* px-1 matches the card's title and the trend card's header above it — text rows in
          this sheet all sit on the same left edge, while the map itself spans the full card
          width like the chart does. */}
      <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1 px-1">
        {legend.map((entry) => {
          const palette = GROUP_COLORS[entry.key]
          return (
            <View key={entry.key} className="flex-row items-center gap-1.5">
              <View style={{ width: 9, height: 9, borderRadius: 2.5, backgroundColor: palette.fill }} />
              <Text className="font-sansSemi text-xs" style={{ color: palette.text }}>
                {entry.label}
              </Text>
              {/* Two decimals, not rounded to whole: a group can legitimately be 0.14% of the
                  balance sheet, and "0%" beside a visible block reads as a bug. */}
              <Text className="font-mono text-xs text-textSecondary">{`${(entry.weight * 100).toFixed(2)}%`}</Text>
            </View>
          )
        })}
      </View>

      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height: mapHeight }}>
        {layouts.map(({ group, accounts: tiles }) => {
          return (
            <View key={group.key}>
              {tiles.map(({ item, x, y, width: w, height: h }, index) => (
                <TreemapTile
                  key={item.key}
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  // Per account, not per block: debt sits among the cash tiles and colour is
                  // the only thing left distinguishing it.
                  color={(item.isLiability ? GROUP_COLORS.liability : GROUP_COLORS[group.key]).fill}
                  textColor={(item.isLiability ? GROUP_COLORS.liability : GROUP_COLORS[group.key]).text}
                  // Stepped like the holdings map: two same-colour neighbours would otherwise
                  // read as one shape split by a gap.
                  tint={Math.max(ACCOUNT_TINT_MAX - index * ACCOUNT_TINT_STEP, ACCOUNT_TINT_MIN)}
                  title={item.label}
                  logo={item.logo}
                  fallbackIcon={fallbackIconFor(item.isLiability ? 'liability' : group.key, item.key)}
                  share={`${item.shareOfTotal >= 0.1 ? Math.round(item.shareOfTotal * 100) : (item.shareOfTotal * 100).toFixed(1)}%`}
                  isSelected={item.key === selectedKey}
                  onPress={() => setSelectedKey((current) => (current === item.key ? null : item.key))}
                />
              ))}
            </View>
          )
        })}
      </View>

      {/* Always rendered, so selecting a tile reveals detail without shifting everything
          below it. Falls back to the total the map divides up. */}
      <Pressable
        onPress={() => setSelectedKey(null)}
        className="h-7 flex-row items-center gap-2 px-1"
        disabled={selected == null}
      >
        {selected ? (
          <>
            <AccountGlyph logo={selected.logo} icon={selectedIcon} size={18} />
            {/* The name is the only elastic part: it shrinks and ellipsizes so the figures,
                which are the reason to tap in the first place, are never pushed off the edge.
                The mask goes with it — an account number truncated to "··50" is worse than
                absent, so it drops out entirely rather than clipping. */}
            <Text className="shrink font-sansSemi text-xs text-textPrimary" numberOfLines={1}>
              {selected.label}
            </Text>
            {selected.mask ? (
              <Text className="shrink-0 font-mono text-xs text-textMuted" numberOfLines={1}>
                {selected.mask}
              </Text>
            ) : null}
            <Text className="ml-auto shrink-0 pl-1 font-mono text-xs text-textSecondary" numberOfLines={1}>
              {`${formatAmount(selected.value)} · ${(selected.shareOfTotal * 100).toFixed(1)}%`}
            </Text>
          </>
        ) : (
          <Text className="shrink font-sans text-xs text-textMuted" numberOfLines={1}>
            Tap a block to identify it
          </Text>
        )}
      </Pressable>

    </View>
  )
}
