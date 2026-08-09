import { Image, Pressable, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors, hexToRgba } from '@/constants/theme'
import { CategoryIcon } from '@/components/categories/CategoryIcon'
import { TRANSFER_TYPES } from '@/lib/transfers/registry'
import { formatAmount } from '@/lib/format/money'
import { countsTowardTotals, isInvestmentSweep } from '@/lib/transactions/totals'
import { amountSign, transactionAmountColor } from '@/lib/transactions/amountDisplay'
import { linkPillLabel } from '@/lib/transactions/linkSummary'
import { useInstitutionLogos } from '@/hooks/useInstitutionLogos'
import type { FeedItem } from '@/lib/transactions/resolveFeed'

interface TransactionRowProps {
  item: FeedItem
  categoryName: string
  categoryColor: string
  /** Icon slug; null when the item has no category, which renders the uncategorized fallback. */
  categoryIcon: string | null
  reimbursementCategoryName: string | null
  onPress?: () => void
}

export function TransactionRow({ item, categoryName, categoryColor, categoryIcon, reimbursementCategoryName, onPress }: TransactionRowProps) {
  // Resolved here rather than passed in, so EVERY surface that renders an entry — the
  // transactions list, account/category detail sheets, anything added later — shows the
  // bank badge without each parent re-wiring it. Rides the shared accounts query cache.
  const institutionLogos = useInstitutionLogos()
  const institutionLogo = item.accountId ? institutionLogos.get(item.accountId) ?? null : null
  const transferType = item.transferKind ? TRANSFER_TYPES[item.transferKind] : null
  // Greyed when the totals leave it out, so the row reads as "not spending, not income" at a
  // glance. Shared with the detail sheet, which has to reach the same verdict.
  const isExcluded = !countsTowardTotals(item)
  const amountColor = transactionAmountColor(item)
  // One badge slot, three sources. A transfer leg names its kind. A reimbursement leg has no
  // transferKind to name — applyTransfers stamps only the other kinds — so it names what came
  // back, which the row's gross amount alone can't convey. A brokerage-cash sweep has no
  // record at all, so it says "Investment", otherwise it would grey out with nothing on the row
  // explaining why it stopped counting; muted rather than coloured, since unlike a transfer or a
  // reimbursement this wasn't a link the user made or confirmed, so it shouldn't shout.
  const reimbursementPill = linkPillLabel(item)
  const badge = transferType
    ? {
        label: item.transferSource === 'auto' ? `${transferType.shortLabel} · Auto` : transferType.shortLabel,
        color: transferType.color,
      }
    : reimbursementPill
      ? { label: reimbursementPill, color: colors.reimbursed }
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
        ) : item.isReimbursementIncome ? (
          <Text style={{ fontSize: 18, color: iconColor }}>↩️</Text>
        ) : (
          <CategoryIcon icon={categoryIcon} size={18} color={iconColor} />
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
          {/* A user-written note beats the raw merchant string — the same rule manual rows
              follow, where the note IS the display name. */}
          {item.note ?? item.merchantName}
        </Text>
      </View>

      <View className="ml-3 items-end gap-0.5">
        <View className="flex-row items-center gap-1.5">
          {/* A reimbursed expense shows what was charged, matching the statement; the pill below
              carries what came back and the net. */}
          <Text className="font-mono text-base" style={{ color: amountColor }}>
            {amountSign(item)}{formatAmount(Math.abs(item.amount))}
          </Text>
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
          // maxWidth so the longest label (a reimbursement's "$2,000.00 back · net -$55.32")
          // ellipsizes instead of squeezing the category name out of the row.
          <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: hexToRgba(badge.color, 0.14), maxWidth: 200 }}>
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
