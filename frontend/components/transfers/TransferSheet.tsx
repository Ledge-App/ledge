import { useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors, hexToRgba } from '@/constants/theme'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { formatAmount } from '@/lib/format/money'
import { TRANSFER_TYPE_LIST, daysBetween } from '@/lib/transfers/registry'
import type { FeedItem } from '@/lib/transactions/resolveFeed'
import type { Account, TransferKind } from '@/types/domain'

interface TransferSheetProps {
  visible: boolean
  expenseItem: FeedItem | null
  /** Every income item eligible to be linked; the selected type's `matches` narrows this. */
  candidateIncomeItems: FeedItem[]
  accounts: Account[]
  isSaving: boolean
  onClose: () => void
  onSave: (input: { kind: TransferKind; incomeItemId: string | null }) => void
}

export function TransferSheet({ visible, expenseItem, candidateIncomeItems, accounts, isSaving, onClose, onSave }: TransferSheetProps) {
  const applicableTypes = useMemo(
    () => (expenseItem ? TRANSFER_TYPE_LIST.filter((type) => type.appliesTo(expenseItem, { accounts })) : []),
    [expenseItem, accounts],
  )

  const [kind, setKind] = useState<TransferKind | null>(null)
  const [selectedIncomeId, setSelectedIncomeId] = useState<string | null>(null)

  // The parent screen keeps one persistent instance and only toggles `visible`, so a selection
  // made for a previous expense must be cleared when a new one is opened.
  useEffect(() => {
    setKind(applicableTypes[0]?.kind ?? null)
    setSelectedIncomeId(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenseItem?.id])

  const selectedType = kind ? applicableTypes.find((type) => type.kind === kind) ?? null : null

  // Closest first: same-day exact matches should be the ones the user doesn't have to scan for.
  const matches = useMemo(() => {
    if (!expenseItem || !selectedType) return []
    return candidateIncomeItems
      .filter((candidate) => selectedType.matches(expenseItem, candidate, { accounts }))
      .sort((a, b) => {
        const dayDelta = daysBetween(expenseItem.date, a.date) - daysBetween(expenseItem.date, b.date)
        if (dayDelta !== 0) return dayDelta
        const target = Math.abs(expenseItem.amount)
        return Math.abs(Math.abs(a.amount) - target) - Math.abs(Math.abs(b.amount) - target)
      })
  }, [expenseItem, selectedType, candidateIncomeItems, accounts])

  // A selection made under one type may not match the next one.
  useEffect(() => {
    if (selectedIncomeId && !matches.some((match) => match.id === selectedIncomeId)) setSelectedIncomeId(null)
  }, [matches, selectedIncomeId])

  if (!expenseItem || !selectedType) return null

  const canSave = selectedIncomeId !== null || selectedType.allowsUnpaired

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View className="flex-row items-center justify-between px-5 py-3">
        <Pressable onPress={onClose} hitSlop={8}>
          <Ionicons name="close" size={22} color={colors.textSecondary} />
        </Pressable>
        <Text className="font-display text-md text-textPrimary">Transfer</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView className="px-5" contentContainerClassName="gap-4 pb-10">
        <Text className="font-mono text-base text-expense">
          {expenseItem.merchantName} {formatAmount(expenseItem.amount)}
        </Text>

        <Text className="font-sansMed text-sm text-textSecondary">Transfer type</Text>
        <View className="flex-row flex-wrap gap-2">
          {applicableTypes.map((type) => {
            const isSelected = type.kind === kind
            return (
              <Pressable
                key={type.kind}
                onPress={() => setKind(type.kind)}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                className="flex-row items-center gap-2 rounded-full border px-3 py-2"
                style={{
                  borderColor: isSelected ? type.color : colors.border,
                  backgroundColor: isSelected ? hexToRgba(type.color, 0.12) : 'transparent',
                }}
              >
                <Ionicons name={type.icon} size={14} color={isSelected ? type.color : colors.textSecondary} />
                <Text className="font-sansMed text-sm" style={{ color: isSelected ? type.color : colors.textSecondary }}>
                  {type.label}
                </Text>
              </Pressable>
            )
          })}
        </View>
        <Text className="font-sans text-sm text-textSecondary">{selectedType.description}</Text>

        <Text className="font-sansMed text-sm text-textSecondary">Matching income</Text>
        {matches.length === 0 ? (
          <Text className="font-sans text-sm text-textMuted">
            No matching income found within a week. Save anyway if the other account isn&apos;t connected — this
            transaction will still be left out of your totals.
          </Text>
        ) : (
          matches.map((candidate) => {
            const isSelected = candidate.id === selectedIncomeId
            const daysApart = daysBetween(expenseItem.date, candidate.date)
            return (
              <Pressable
                key={candidate.id}
                onPress={() => setSelectedIncomeId(isSelected ? null : candidate.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                className="flex-row items-center justify-between rounded-lg border px-3 py-3"
                style={{
                  borderColor: isSelected ? selectedType.color : colors.border,
                  backgroundColor: isSelected ? hexToRgba(selectedType.color, 0.1) : 'transparent',
                }}
              >
                <View className="flex-1 gap-0.5 pr-3">
                  <Text className="font-sans text-base text-textPrimary" numberOfLines={1}>
                    {candidate.merchantName}
                  </Text>
                  <Text className="font-sans text-xs text-textMuted">
                    {candidate.date}
                    {daysApart === 0 ? ' · same day' : ` · ${daysApart} day${daysApart === 1 ? '' : 's'} apart`}
                  </Text>
                </View>
                <Text className="font-mono text-sm text-income">{formatAmount(Math.abs(candidate.amount))}</Text>
                {isSelected ? (
                  <Ionicons name="checkmark-circle" size={18} color={selectedType.color} style={{ marginLeft: 8 }} />
                ) : null}
              </Pressable>
            )
          })
        )}

        <Button
          label={selectedIncomeId ? 'Save Transfer' : 'Save without match'}
          onPress={() => onSave({ kind: selectedType.kind, incomeItemId: selectedIncomeId })}
          disabled={!canSave}
          loading={isSaving}
        />
      </ScrollView>
    </BottomSheet>
  )
}
