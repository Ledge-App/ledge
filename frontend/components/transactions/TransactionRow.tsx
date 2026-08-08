import { Image, Pressable, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors, hexToRgba } from '@/constants/theme'
import { TRANSFER_TYPES } from '@/lib/transfers/registry'
import { formatAmount } from '@/lib/format/money'
import { countsTowardTotals, isInvestmentSweep } from '@/lib/transactions/totals'
import { useInstitutionLogos } from '@/hooks/useInstitutionLogos'
import type { FeedItem } from '@/lib/transactions/resolveFeed'

interface TransactionRowProps {
  item: FeedItem
  categoryName: string
  categoryColor: string
  categoryIcon: string
  reimbursementCategoryName: string | null
  onPress?: () => void
}

export function TransactionRow({ item, categoryName, categoryColor, categoryIcon, reimbursementCategoryName, onPress }: TransactionRowProps) {
  // Resolved here rather than passed in, so EVERY surface that renders an entry — the
  // transactions list, account/category detail sheets, anything added later — shows the
  // bank badge without each parent re-wiring it. Rides the shared accounts query cache.
  const institutionLogos = useInstitutionLogos()
  const institutionLogo = item.accountId ? institutionLogos.get(item.accountId) ?? null : null
  const isIncome = item.amount < 0
  const transferType = item.transferKind ? TRANSFER_TYPES[item.transferKind] : null
  // Anything excluded from the totals is greyed rather than shown in red/green, so the row reads
  // as "not spending, not income" at a glance instead of looking like money that moved. Keyed on
  // the same predicate the aggregates use, so what's grey and what's counted can never disagree —
  // this covers transfer legs (where a badge carries the meaning) and brokerage-cash sweeps
  // (where nothing else marks them).
  const isExcluded = !countsTowardTotals(item)
  const amountColor = isExcluded ? colors.textMuted : isIncome ? colors.income : colors.expense
  // One badge slot, two sources. A transfer leg names its kind; a brokerage-cash sweep has no
  // transfer record to name, so it says "Investment" — otherwise it would grey out with nothing
  // on the row explaining why it stopped counting. Muted rather than coloured: unlike a transfer,
  // this wasn't a link the user made or confirmed, so it shouldn't shout.
  const badge = transferType
    ? {
        label: item.transferSource === 'auto' ? `${transferType.shortLabel} · Auto` : transferType.shortLabel,
        color: transferType.color,
      }
    : isInvestmentSweep(item)
      ? { label: 'Investment', color: colors.textMuted }
      : null
  const iconColor = transferType ? transferType.color : item.isReimbursementIncome ? colors.reimbursed : categoryColor
  const iconBg = hexToRgba(iconColor, 0.18)

  return (
    <Pressable onPress={onPress} className="flex-row items-center gap-3 py-3">
      <View className="h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: iconBg }}>
        {transferType ? (
          <Ionicons name={transferType.icon} size={18} color={iconColor} />
        ) : (
          <Text style={{ fontSize: 18, color: iconColor }}>{item.isReimbursementIncome ? '↩️' : categoryIcon}</Text>
        )}
        {item.source === 'manual' ? (
          <View className="absolute -bottom-0.5 -right-0.5 h-4 w-4 items-center justify-center rounded-full bg-surface">
            <Text style={{ fontSize: 10 }}>✏️</Text>
          </View>
        ) : null}
      </View>

      <View className="flex-1 gap-0.5">
        <Text
          className={`font-sansSemi text-base ${isExcluded ? 'text-textSecondary' : 'text-textPrimary'}`}
          numberOfLines={1}
        >
          {item.isReimbursementIncome
            ? reimbursementCategoryName
              ? `Reimbursement · ${reimbursementCategoryName}`
              : 'Reimbursement'
            : categoryName}
        </Text>
        <Text className="font-sans text-sm text-textSecondary" numberOfLines={1}>
          {item.merchantName}
        </Text>
      </View>

      <View className="ml-3 items-end gap-0.5">
        <View className="flex-row items-center gap-1.5">
          {item.reimbursedAmount != null && item.netAmount != null ? (
            <Text className="font-mono text-base" style={{ color: colors.reimbursed }}>
              [{formatAmount(item.amount)} → {formatAmount(item.netAmount)}]
            </Text>
          ) : (
            <Text className="font-mono text-base" style={{ color: amountColor }}>
              {isIncome ? '+' : '-'}{formatAmount(Math.abs(item.amount))}
            </Text>
          )}
          {institutionLogo ? (
            // Which card/bank this hit, at a glance — mirrors the amount-side bank chip in
            // apps like the reference tracker. Base64 PNG straight from Plaid. The ring
            // repeats the amount's meaning: green in, red out, muted for anything not counted.
            <View style={{ borderWidth: 1.5, borderColor: amountColor, borderRadius: 12, padding: 1 }}>
              <Image
                source={{ uri: `data:image/png;base64,${institutionLogo}` }}
                style={{ width: 17, height: 17, borderRadius: 8.5 }}
              />
            </View>
          ) : null}
        </View>
        {badge ? (
          // Under the amount, not beside the title: the badge is the row's meaning ('Auto'
          // marks links made by auto-detection; unmarking is the one-tap undo) and here it
          // never competes with the category name for width.
          <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: hexToRgba(badge.color, 0.14) }}>
            <Text className="font-sansMed text-xs" numberOfLines={1} style={{ color: badge.color }}>
              {badge.label}
            </Text>
          </View>
        ) : null}
        {item.confidenceLevel === 'MEDIUM' ? <Text style={{ fontSize: 11 }}>❓</Text> : null}
      </View>
    </Pressable>
  )
}
