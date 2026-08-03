import { useEffect, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '@/constants/theme'
import { SlideUpSheet } from '@/components/ui/SlideUpSheet'
import { Button } from '@/components/ui/Button'
import { formatAmount } from '@/lib/format/money'
import type { FeedItem } from '@/lib/transactions/resolveFeed'

interface ReimbursementSheetProps {
  visible: boolean
  expenseItem: FeedItem | null
  candidateIncomeItems: FeedItem[]
  onClose: () => void
  onSave: (linkedIncomeIds: string[]) => void
}

export function ReimbursementSheet({ visible, expenseItem, candidateIncomeItems, onClose, onSave }: ReimbursementSheetProps) {
  const [linkedIds, setLinkedIds] = useState<string[]>([])

  // The parent screen keeps one persistent instance of this sheet and only toggles `visible`,
  // so links selected for a previous expense must be cleared when a new one is opened.
  useEffect(() => {
    setLinkedIds([])
  }, [expenseItem?.id])

  if (!expenseItem) return null

  const linkedItems = candidateIncomeItems.filter((c) => linkedIds.includes(c.id))
  const linkedTotal = linkedItems.reduce((sum, c) => sum + Math.abs(c.amount), 0)
  const netExpense = Math.max(0, expenseItem.amount - linkedTotal)
  const unlinkedCandidates = candidateIncomeItems.filter((c) => !linkedIds.includes(c.id))

  function toggleLink(id: string) {
    setLinkedIds((prev) => (prev.includes(id) ? prev.filter((existing) => existing !== id) : [...prev, id]))
  }

  return (
    <SlideUpSheet visible={visible} onClose={onClose}>
      <View className="flex-row items-center justify-between px-5 py-3">
        <Pressable onPress={onClose} hitSlop={8}>
          <Ionicons name="close" size={22} color={colors.textSecondary} />
        </Pressable>
        <Text className="font-display text-md text-textPrimary">Reimbursement</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView className="px-5" contentContainerClassName="gap-4 pb-10">
        <Text className="font-mono text-base text-expense">
          {expenseItem.merchantName} {formatAmount(expenseItem.amount)}
        </Text>

        <Text className="font-sansMed text-sm text-textSecondary">Link incoming payment(s)</Text>
        {unlinkedCandidates.map((candidate) => (
          <View key={candidate.id} className="flex-row items-center justify-between py-2">
            <View className="flex-row items-center gap-2">
              <Ionicons name="arrow-undo" size={16} color={colors.reimbursed} />
              <Text className="font-sans text-base text-textPrimary">{candidate.merchantName}</Text>
              <Text className="font-mono text-sm text-income">{formatAmount(Math.abs(candidate.amount))}</Text>
            </View>
            <Pressable onPress={() => toggleLink(candidate.id)}>
              <Text className="font-sansMed text-sm text-primary">Link</Text>
            </Pressable>
          </View>
        ))}

        {linkedItems.length > 0 ? (
          <View className="gap-2">
            <Text className="font-sansMed text-sm text-textSecondary">Linked:</Text>
            {linkedItems.map((linked) => (
              <View key={linked.id} className="flex-row items-center justify-between py-1">
                <Text className="font-sans text-base text-textPrimary">
                  ✓ {linked.merchantName} {formatAmount(Math.abs(linked.amount))}
                </Text>
                <Pressable onPress={() => toggleLink(linked.id)} hitSlop={8}>
                  <Ionicons name="close" size={18} color={colors.textMuted} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        <Text className="font-sans text-base text-textPrimary">
          Net expense: {formatAmount(expenseItem.amount)} − {formatAmount(linkedTotal)} ={' '}
          <Text className="font-mono text-expense">{formatAmount(netExpense)}</Text>
        </Text>

        <Button label="Save Reimbursement" onPress={() => onSave(linkedIds)} disabled={linkedIds.length === 0} />
      </ScrollView>
    </SlideUpSheet>
  )
}
