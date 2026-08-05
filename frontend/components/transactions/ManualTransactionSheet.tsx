import { useEffect, useState } from 'react'
import { Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { Ionicons } from '@expo/vector-icons'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { CategoryPicker } from '@/components/categories/CategoryPicker'
import { TextField } from '@/components/ui/TextField'
import { Button } from '@/components/ui/Button'
import { colors } from '@/constants/theme'
import type { Category, ManualTransaction, Subcategory } from '@/types/domain'

// `date` is a calendar day (YYYY-MM-DD) with no timezone. DateTimePicker works in the device's
// LOCAL timezone, so converting via Date.toISOString()/new Date(string) — both UTC — shifts the
// day by one for any non-UTC device. These helpers keep the round-trip local.
function toDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function fromDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(year, month - 1, day)
}

interface ManualTransactionSheetProps {
  visible: boolean
  transaction?: ManualTransaction
  categories: Category[]
  subcategories: Subcategory[]
  isSaving: boolean
  onClose: () => void
  onSave: (input: { amount: string; type: 'expense' | 'income'; categoryId: string | null; subcategoryId: string | null; date: string; note: string | null }) => void
  onDelete?: () => void
}

export function ManualTransactionSheet({ visible, transaction, categories, subcategories, isSaving, onClose, onSave, onDelete }: ManualTransactionSheetProps) {
  const [type, setType] = useState<'expense' | 'income'>(transaction?.type ?? 'expense')
  const [amountText, setAmountText] = useState(transaction?.amount ?? '')
  const [categoryId, setCategoryId] = useState<string | null>(transaction?.categoryId ?? null)
  const [subcategoryId, setSubcategoryId] = useState<string | null>(transaction?.subcategoryId ?? null)
  const [date, setDate] = useState(transaction?.date ?? toDateKey(new Date()))
  const [note, setNote] = useState(transaction?.note ?? '')
  const [showAndroidPicker, setShowAndroidPicker] = useState(false)

  // The parent screen keeps one persistent instance of this sheet and only toggles `visible`,
  // so local state must be re-derived whenever it's reopened for a different transaction —
  // including the edit -> create transition, where `transaction?.id` goes to undefined.
  useEffect(() => {
    setType(transaction?.type ?? 'expense')
    setAmountText(transaction?.amount ?? '')
    setCategoryId(transaction?.categoryId ?? null)
    setSubcategoryId(transaction?.subcategoryId ?? null)
    setDate(transaction?.date ?? toDateKey(new Date()))
    setNote(transaction?.note ?? '')
  }, [transaction?.id])

  const availableSubcategories = subcategories.filter((s) => s.categoryId === categoryId)
  const isValidAmount = /^\d+(\.\d{1,2})?$/.test(amountText) && Number(amountText) > 0

  function handleSave() {
    onSave({
      amount: amountText,
      type,
      categoryId,
      subcategoryId,
      date,
      note: note.trim().length > 0 ? note.trim() : null,
    })
  }

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View className="flex-row items-center justify-between px-5 py-3">
        <Pressable onPress={onClose} hitSlop={8}>
          <Ionicons name="close" size={22} color={colors.textSecondary} />
        </Pressable>
        <Text className="font-display text-md text-textPrimary">
          {transaction ? 'Edit Transaction' : 'Add Transaction'}
        </Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView className="px-5" contentContainerClassName="gap-4 pb-10" keyboardShouldPersistTaps="handled">

        <SegmentedControl
          options={[{ label: 'Expense', value: 'expense' as const }, { label: 'Income', value: 'income' as const }]}
          value={type}
          onChange={setType}
        />

        <View className="my-4 items-center">
          <Text className="font-sansMed text-sm text-textSecondary">Amount</Text>
          <TextInput
            value={amountText}
            onChangeText={setAmountText}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={colors.textMuted}
            className={`font-display text-3xl ${type === 'expense' ? 'text-expense' : 'text-income'}`}
          />
        </View>

        <Text className="mb-2 font-sansMed text-sm text-textSecondary">Category</Text>
        <CategoryPicker
          categories={categories}
          selectedCategoryId={categoryId}
          onSelect={(id) => {
            setCategoryId(id)
            setSubcategoryId(null)
          }}
        />

        {availableSubcategories.length > 0 ? (
          <View className="mt-3 flex-row flex-wrap gap-2">
            {availableSubcategories.map((sub) => (
              <Text
                key={sub.id}
                onPress={() => setSubcategoryId(sub.id)}
                className={`rounded-full border px-3 py-2 font-sansMed text-sm ${
                  subcategoryId === sub.id ? 'border-primary bg-primaryMuted text-primary' : 'border-border text-textSecondary'
                }`}
              >
                {sub.name}
              </Text>
            ))}
          </View>
        ) : null}

        <View className="my-4">
          <Text className="mb-2 font-sansMed text-sm text-textSecondary">Date</Text>
          {Platform.OS === 'ios' ? (
            <DateTimePicker
              value={fromDateKey(date)}
              mode="date"
              display="inline"
              onChange={(_, selected) => selected && setDate(toDateKey(selected))}
            />
          ) : (
            <>
              <Pressable onPress={() => setShowAndroidPicker(true)} className="rounded-lg border border-border px-3 py-3">
                <Text className="font-sans text-base text-textPrimary">{date}</Text>
              </Pressable>
              {showAndroidPicker ? (
                <DateTimePicker
                  value={fromDateKey(date)}
                  mode="date"
                  display="default"
                  onChange={(_, selected) => {
                    setShowAndroidPicker(false)
                    if (selected) setDate(toDateKey(selected))
                  }}
                />
              ) : null}
            </>
          )}
        </View>

        <TextField label="Note (optional)" value={note} onChangeText={setNote} placeholder="e.g. Street food, cash" />

        <View className="mt-4 gap-2">
          <Button label="Save Transaction" onPress={handleSave} disabled={!isValidAmount} loading={isSaving} />
          {onDelete ? <Button label="Delete Transaction" variant="ghost" onPress={onDelete} /> : null}
        </View>
      </ScrollView>
    </BottomSheet>
  )
}
