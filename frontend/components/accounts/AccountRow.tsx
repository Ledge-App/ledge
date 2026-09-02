import { Image, Pressable, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '@/constants/theme'
import { FINANCEKIT_ITEM_ID } from '@/lib/financekit/mergeAccounts'
import { formatMaskableAmount } from '@/lib/format/money'

interface AccountRowProps {
  name: string
  balance: number
  variant: 'cash' | 'credit' | 'investment' | 'cashOnHand'
  limit?: number | null
  isMasked: boolean
  /** Base64 PNG institution logo; replaces the generic variant icon when present. */
  logo?: string | null
  /** The account's item. Only read to spot Apple accounts, which get the Apple mark. */
  itemId?: string | null
  onPress?: () => void
  /**
   * Drag-to-reorder handlers, applied to the SAME Pressable that handles the tap. Wrapping
   * this row in another Pressable would not work: the inner one wins the responder on touch
   * start and the outer never sees the gesture at all.
   */
  onLongPress?: () => void
  onPressOut?: () => void
  delayLongPress?: number
}

/**
 * Stand-in glyphs for accounts with no institution logo. Exported so the composition map
 * falls back to the SAME icon this row does — an account should not be a wallet here and a
 * generic square there.
 */
export const variantIcons: Record<string, { name: string; color: string }> = {
  cash: { name: 'wallet', color: '#3B82F6' },
  investment: { name: 'trending-up', color: '#E11D48' },
  credit: { name: 'card', color: '#6B7280' },
  // Banknotes rather than a wallet, so the always-present cash row reads as distinct from
  // a linked bank account at a glance.
  cashOnHand: { name: 'cash', color: colors.income },
}

/**
 * The Apple mark, standing in for the institution logo FinanceKit does not supply.
 *
 * Apple accounts come from Wallet rather than Plaid, so `institutionLogo` is always null for them
 * and they would otherwise fall back to the grey generic card that every unlinked credit row uses
 * — beside a row named "Apple Card", that reads as a logo that failed to load. Monochrome and in
 * the text colour, matching the Apple row in AddAccountSheet and the sign-in button.
 */
export const appleIcon = { name: 'logo-apple', color: colors.textPrimary }

/**
 * Which glyph an account shows when there is no institution logo to show instead.
 *
 * One function rather than a lookup at each call site, so the accounts list and the net worth map
 * cannot disagree about what an account looks like.
 */
export function accountFallbackIcon(variant: string, itemId?: string | null) {
  if (itemId === FINANCEKIT_ITEM_ID) return appleIcon
  return variantIcons[variant] ?? variantIcons.cash
}

export function AccountRow({
  name,
  balance,
  variant,
  limit,
  isMasked,
  logo,
  itemId,
  onPress,
  onLongPress,
  onPressOut,
  delayLongPress,
}: AccountRowProps) {
  const balanceColor = variant === 'credit' ? colors.expense : colors.textPrimary
  const icon = accountFallbackIcon(variant, itemId)

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressOut={onPressOut}
      delayLongPress={delayLongPress}
      className="flex-row items-center justify-between py-3.5"
    >
      <View className="flex-1 flex-row items-center gap-3">
        {logo ? (
          <Image
            source={{ uri: `data:image/png;base64,${logo}` }}
            style={{ width: 36, height: 36, borderRadius: 8 }}
          />
        ) : (
          <View className="h-9 w-9 items-center justify-center rounded-lg bg-surfaceRaised">
            <Ionicons name={icon.name as any} size={18} color={icon.color} />
          </View>
        )}
        <Text className="flex-shrink font-sansMed text-base text-textPrimary" numberOfLines={1}>{name}</Text>
      </View>
      <View className="ml-3 items-end">
        <Text className="font-mono text-base" style={{ color: balanceColor }}>
          {formatMaskableAmount(balance, isMasked)}
        </Text>
        {variant === 'credit' && limit != null ? (
          <Text className="font-sans text-xs text-textMuted">Limit {formatMaskableAmount(limit, isMasked)}</Text>
        ) : null}
      </View>
    </Pressable>
  )
}
