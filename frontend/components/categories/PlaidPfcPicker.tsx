import { useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '@/constants/theme'
import { PFC_TAXONOMY, pfcLabel } from '@/constants/plaid'
import { resolvePfcOwnership } from '@/lib/categories/pfcOwnership'
import type { Category, PlaidCategoryMapping } from '@/types/domain'

interface PlaidPfcPickerProps {
  mappings: PlaidCategoryMapping[]
  categories: Category[]
  currentCategoryId: string | null
  selectedCodes: Set<string>
  onChange: (codes: Set<string>) => void
}

export function PlaidPfcPicker({ mappings, categories, currentCategoryId, selectedCodes, onChange }: PlaidPfcPickerProps) {
  const [expandedPrimary, setExpandedPrimary] = useState<string | null>(null)
  const ownership = resolvePfcOwnership(mappings, categories)

  function toggleCode(code: string) {
    const next = new Set(selectedCodes)
    if (next.has(code)) next.delete(code)
    else next.add(code)
    onChange(next)
  }

  return (
    <View className="gap-2">
      {PFC_TAXONOMY.map((group) => {
        const isExpanded = expandedPrimary === group.primary
        return (
          <View key={group.primary} className="rounded-md bg-surface">
            <Pressable
              onPress={() => setExpandedPrimary(isExpanded ? null : group.primary)}
              className="flex-row items-center justify-between px-4 py-3"
            >
              <Text className="font-sansSemi text-base text-textPrimary">{pfcLabel(group.primary, '')}</Text>
              <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSecondary} />
            </Pressable>

            {isExpanded ? (
              <View className="gap-1 px-4 pb-3">
                {group.detailedCodes.map((code) => {
                  const owner = ownership.get(code)
                  const isOwnedByOther = owner != null && owner.categoryId !== currentCategoryId
                  const isChecked = selectedCodes.has(code)

                  return (
                    <Pressable
                      key={code}
                      onPress={() => !isOwnedByOther && toggleCode(code)}
                      disabled={isOwnedByOther}
                      className="flex-row items-center gap-3 py-2"
                    >
                      <Ionicons
                        name={isChecked ? 'checkbox' : 'square-outline'}
                        size={20}
                        color={isOwnedByOther ? colors.textMuted : isChecked ? colors.primary : colors.textSecondary}
                      />
                      <Text
                        className={`font-sans text-base ${isOwnedByOther ? 'text-textMuted' : 'text-textPrimary'}`}
                      >
                        {pfcLabel(code, group.primary)}
                      </Text>
                      {isOwnedByOther ? (
                        <Text className="ml-auto font-sans text-xs text-textMuted">{owner.categoryName}</Text>
                      ) : null}
                    </Pressable>
                  )
                })}
              </View>
            ) : null}
          </View>
        )
      })}
    </View>
  )
}
