import { useState } from 'react'
import { Platform, Text, TextInput, View } from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { CategoryPicker } from '@/components/categories/CategoryPicker'
import { TextField } from '@/components/ui/TextField'
import { Button } from '@/components/ui/Button'
import { colors } from '@/constants/theme'
import type { Category, ManualTransaction, Subcategory } from '@/types/domain'

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
  const [date, setDate] = useState(transaction?.date ?? new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState(transaction?.note ?? '')

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
      <Text className="mb-4 font-sansSemi text-lg text-textPrimary">
        {transaction ? 'Edit Transaction' : 'Add Transaction'}
      </Text>

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
        <DateTimePicker
          value={new Date(date)}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={(_, selected) => selected && setDate(selected.toISOString().slice(0, 10))}
        />
      </View>

      <TextField label="Note (optional)" value={note} onChangeText={setNote} placeholder="e.g. Street food, cash" />

      <View className="mt-4 gap-2">
        <Button label="Save Transaction" onPress={handleSave} disabled={!isValidAmount} loading={isSaving} />
        {onDelete ? <Button label="Delete Transaction" variant="ghost" onPress={onDelete} /> : null}
      </View>
    </BottomSheet>
  )
}
