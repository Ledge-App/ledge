import { Image, Pressable, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors, hexToRgba } from '@/constants/theme'
import { TRANSFER_TYPES } from '@/lib/transfers/registry'
import { formatAmount } from '@/lib/format/money'
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
  // Both legs are excluded from every total, so the amount is muted rather than read as
  // spending or income — the badge is what carries the meaning.
  const amountColor = transferType ? colors.textMuted : isIncome ? colors.income : colors.expense
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
          className={`font-sansSemi text-base ${transferType ? 'text-textSecondary' : 'text-textPrimary'}`}
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
            // apps like the reference tracker. Base64 PNG straight from Plaid.
            <Image
              source={{ uri: `data:image/png;base64,${institutionLogo}` }}
              style={{ width: 16, height: 16, borderRadius: 8 }}
            />
          ) : null}
        </View>
        {transferType ? (
          // Under the amount, not beside the title: the badge is the row's meaning ('Auto'
          // marks links made by auto-detection; unmarking is the one-tap undo) and here it
          // never competes with the category name for width.
          <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: hexToRgba(transferType.color, 0.14) }}>
            <Text className="font-sansMed text-xs" numberOfLines={1} style={{ color: transferType.color }}>
              {item.transferSource === 'auto' ? `${transferType.shortLabel} · Auto` : transferType.shortLabel}
            </Text>
          </View>
        ) : null}
        {item.confidenceLevel === 'MEDIUM' ? <Text style={{ fontSize: 11 }}>❓</Text> : null}
      </View>
    </Pressable>
  )
}
