import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { BottomSheet, useSheetScroll } from '@/components/ui/BottomSheet'
import { HoldingsHeatMap } from '@/components/accounts/HoldingsHeatMap'
import { colors } from '@/constants/theme'
import { useHoldings } from '@/hooks/useHoldings'
import { assetClass, averageCost, formatShares, holdingLabel, monogramText } from '@/lib/accounts/holdings'
import { hexToRgba } from '@/constants/theme'
import { formatCompactMaskableAmount, formatMaskableAmount } from '@/lib/format/money'
import type { Account, Holding } from '@/types/domain'

interface InvestmentDetailSheetProps {
  account: Account | null
  isMasked: boolean
  onClose: () => void
}

// Column widths shared by the header row and every body row so they stay aligned.
const COL = { shares: 52, price: 72, value: 84 } as const

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

// Investment accounts get holdings (what you own), not a transaction list — buys, sells
// and dividends inside a brokerage aren't household spending or income, which is exactly
// why these accounts live in their own section.
export function InvestmentDetailSheet({ account, isMasked, onClose }: InvestmentDetailSheetProps) {
  const sheetScroll = useSheetScroll()
  const holdings = useHoldings(account ? { itemId: account.itemId, accountId: account.account_id } : null)
  const needsRelink = holdings.error?.message.includes('ADDITIONAL_CONSENT_REQUIRED') ?? false

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
      </ScrollView>
    </BottomSheet>
  )
}
