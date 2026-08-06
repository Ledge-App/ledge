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
  item: FeedItem | null
  candidateItems: FeedItem[]
  accounts: Account[]
  isSaving: boolean
  forcedKind?: TransferKind
  onClose: () => void
  onSave: (input: { kind: TransferKind; counterpartIds: string[] }) => void
}

export function TransferSheet({ visible, item, candidateItems, accounts, isSaving, forcedKind, onClose, onSave }: TransferSheetProps) {
  const applicableTypes = useMemo(
    () => (item ? TRANSFER_TYPE_LIST.filter((type) => type.kind !== 'reimbursement' && type.appliesTo(item, { accounts })) : []),
    [item, accounts],
  )

  const [kindOverride, setKindOverride] = useState<TransferKind | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  useEffect(() => {
    setKindOverride(null)
    setSelectedIds([])
  }, [item?.id])

  const kind = forcedKind ?? kindOverride ?? applicableTypes[0]?.kind ?? null
  const selectedType = kind ? (forcedKind ? TRANSFER_TYPE_LIST.find((t) => t.kind === kind) ?? null : applicableTypes.find((type) => type.kind === kind) ?? null) : null
  const isMultiSelect = selectedType?.multiSelect === true

  // Reset selection when switching kinds
  useEffect(() => {
    setSelectedIds([])
  }, [kind])

  const matches = useMemo(() => {
    if (!item || !selectedType) return []
    return candidateItems
      .filter((candidate) => selectedType.matches(item, candidate, { accounts }))
      .sort((a, b) => {
        const dayDelta = daysBetween(item.date, a.date) - daysBetween(item.date, b.date)
        if (dayDelta !== 0) return dayDelta
        const target = Math.abs(item.amount)
        return Math.abs(Math.abs(a.amount) - target) - Math.abs(Math.abs(b.amount) - target)
      })
  }, [item, selectedType, candidateItems, accounts])

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => matches.some((m) => m.id === id)))
  }, [matches])

  if (!item || !selectedType) return null

  const isStartingFromExpense = item.amount > 0
  const canSave = selectedIds.length > 0 || selectedType.allowsUnpaired

  function toggleId(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((existing) => existing !== id)
      if (isMultiSelect) return [...prev, id]
      return [id]
    })
  }

  const selectedTotal = isMultiSelect
    ? selectedIds.reduce((sum, id) => {
        const m = matches.find((c) => c.id === id)
        return sum + (m ? Math.abs(m.amount) : 0)
      }, 0)
    : null

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
        <Text className={`font-mono text-base ${isStartingFromExpense ? 'text-expense' : 'text-income'}`}>
          {item.merchantName} {formatAmount(item.amount)}
        </Text>

        {forcedKind ? null : <View className="flex-row flex-wrap gap-2">
          {applicableTypes.map((type) => {
            const isSelected = type.kind === kind
            return (
              <Pressable
                key={type.kind}
                onPress={() => setKindOverride(type.kind)}
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
        </View>}

        <Text className="font-display text-base text-textPrimary">
          {isMultiSelect ? 'Link incoming payment(s)' : isStartingFromExpense ? 'Matching income' : 'Matching expense'}
        </Text>
        {matches.length === 0 ? (
          <Text className="font-sans text-sm text-textMuted">
            No matching {isStartingFromExpense ? 'income' : 'expense'} found.
          </Text>
        ) : (
          matches.map((candidate) => {
            const isSelected = selectedIds.includes(candidate.id)
            const daysApart = daysBetween(item.date, candidate.date)
            return (
              <Pressable
                key={candidate.id}
                onPress={() => toggleId(candidate.id)}
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
                <Text className={`font-mono text-sm ${candidate.amount > 0 ? 'text-expense' : 'text-income'}`}>
                  {formatAmount(Math.abs(candidate.amount))}
                </Text>
                {isSelected ? (
                  <Ionicons name="checkmark-circle" size={18} color={selectedType.color} style={{ marginLeft: 8 }} />
                ) : null}
              </Pressable>
            )
          })
        )}

        {isMultiSelect && selectedTotal != null && selectedTotal > 0 ? (
          <Text className="font-sans text-base text-textPrimary">
            Net expense: {formatAmount(item.amount)} − {formatAmount(selectedTotal)} ={' '}
            <Text className="font-mono text-expense">{formatAmount(Math.max(0, item.amount - selectedTotal))}</Text>
          </Text>
        ) : null}

        <Button
          label={selectedIds.length > 0 ? (isMultiSelect ? `Link ${selectedIds.length} payment${selectedIds.length > 1 ? 's' : ''}` : 'Save Transfer') : 'Save without match'}
          onPress={() => onSave({ kind: selectedType.kind, counterpartIds: selectedIds })}
          disabled={!canSave}
          loading={isSaving}
        />
      </ScrollView>
    </BottomSheet>
  )
}
