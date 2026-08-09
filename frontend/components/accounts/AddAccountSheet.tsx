import { Image, Pressable, ScrollView, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '@/constants/theme'
import { BottomSheet, useSheetScroll } from '@/components/ui/BottomSheet'
import type { Institution } from '@/types/domain'

interface AddAccountSheetProps {
  visible: boolean
  onClose: () => void
  institutions: Institution[]
  /** Institution logos live on account rows, not on the institution record. */
  logoByItemId: Map<string, string | null>
  onManageInstitution: (itemId: string) => void
  onConnectNewBank: () => void
}

/**
 * One list instead of a "new card or new bank?" question. The user points at the bank they mean
 * and the Link mode follows from what they tapped — an existing bank opens update mode (free,
 * reuses the stored access token), the last row opens create mode (spends a Plaid connection).
 *
 * That framing is the whole point: Plaid decides create-vs-update when the link token is minted,
 * before Link opens, and the institution is chosen inside Plaid's own UI. So the app cannot
 * notice "they already have Chase" after the fact — by then the Item exists. Asking first, in the
 * user's own terms, is what keeps a second Item from being created for a bank already connected.
 */
export function AddAccountSheet({
  visible,
  onClose,
  institutions,
  logoByItemId,
  onManageInstitution,
  onConnectNewBank,
}: AddAccountSheetProps) {
  const sheetScroll = useSheetScroll()

  return (
    <BottomSheet visible={visible} onClose={onClose} contentScroll={sheetScroll}>
      <View className="px-5 pb-2 pt-1">
        <Text className="font-sansSemi text-lg text-textPrimary">Add an account</Text>
      </View>

      <ScrollView {...sheetScroll.scrollProps} contentContainerClassName="gap-1 px-5 pb-6">
        {institutions.length > 0 ? (
          <Text className="pb-1 pt-2 font-sansMed text-xs text-textMuted">CONNECTED BANKS</Text>
        ) : null}

        {institutions.map((institution) => {
          const logo = logoByItemId.get(institution.itemId) ?? null
          return (
            <Pressable
              key={institution.itemId}
              onPress={() => onManageInstitution(institution.itemId)}
              accessibilityRole="button"
              accessibilityLabel={`Choose accounts at ${institution.institutionName}`}
              className="flex-row items-center gap-3 rounded-xl bg-surface px-4 py-3"
            >
              {logo ? (
                <Image
                  source={{ uri: `data:image/png;base64,${logo}` }}
                  style={{ width: 36, height: 36, borderRadius: 18 }}
                />
              ) : (
                <View className="h-9 w-9 items-center justify-center rounded-full bg-surfaceRaised">
                  <Ionicons name="business" size={18} color={colors.textSecondary} />
                </View>
              )}
              <View className="flex-1">
                <Text className="font-sansMed text-base text-textPrimary">{institution.institutionName}</Text>
                <Text className="font-sans text-xs text-textMuted">Choose which accounts to share</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          )
        })}

        <Text className="pb-1 pt-4 font-sansMed text-xs text-textMuted">SOMEWHERE ELSE</Text>
        <Pressable
          onPress={onConnectNewBank}
          accessibilityRole="button"
          accessibilityLabel="Connect a new bank"
          className="flex-row items-center gap-3 rounded-xl bg-surface px-4 py-3"
        >
          <View className="h-9 w-9 items-center justify-center rounded-full bg-surfaceRaised">
            <Ionicons name="add" size={20} color={colors.primary} />
          </View>
          <View className="flex-1">
            <Text className="font-sansMed text-base text-textPrimary">Connect a new bank</Text>
            {/* The cost is stated on the only row that carries it. */}
            <Text className="font-sans text-xs text-textMuted">Uses one of your Plaid connections</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
      </ScrollView>
    </BottomSheet>
  )
}
