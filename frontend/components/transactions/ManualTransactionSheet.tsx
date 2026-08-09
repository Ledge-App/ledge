import { useEffect, useRef, useState } from 'react'
import { Keyboard, Platform, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { Ionicons } from '@expo/vector-icons'
import { BottomSheet, useSheetScroll } from '@/components/ui/BottomSheet'
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
  onSave: (input: ManualTransactionInput) => void
  onDelete?: () => void
  /** True when this transaction is already the expense leg of a transfer. */
  isTransfer?: boolean
  /** True when this transaction is already part of a reimbursement (either leg). */
  isReimbursed?: boolean
  /** Persists the edit, then opens the transfer sheet to pick a counterparty. */
  onSaveAndMarkTransfer?: (input: ManualTransactionInput) => void
  /** Persists the edit, then opens the transfer sheet forced to reimbursement. */
  onSaveAndMarkReimbursement?: (input: ManualTransactionInput) => void
  /** Persists the edit and deletes the transfer link. */
  onSaveAndUnmarkTransfer?: (input: ManualTransactionInput) => void
}

export interface ManualTransactionInput {
  amount: string
  type: 'expense' | 'income'
  categoryId: string | null
  subcategoryId: string | null
  date: string
  note: string | null
}

export function ManualTransactionSheet({
  visible,
  transaction,
  categories,
  subcategories,
  isSaving,
  onClose,
  onSave,
  onDelete,
  isTransfer = false,
  isReimbursed = false,
  onSaveAndMarkTransfer,
  onSaveAndMarkReimbursement,
  onSaveAndUnmarkTransfer,
}: ManualTransactionSheetProps) {
  const sheetScroll = useSheetScroll()
  const [type, setType] = useState<'expense' | 'income'>(transaction?.type ?? 'expense')
  const [amountText, setAmountText] = useState(transaction?.amount ?? '')
  const [categoryId, setCategoryId] = useState<string | null>(transaction?.categoryId ?? null)
  const [subcategoryId, setSubcategoryId] = useState<string | null>(transaction?.subcategoryId ?? null)
  const [date, setDate] = useState(transaction?.date ?? toDateKey(new Date()))
  const [note, setNote] = useState(transaction?.note ?? '')
  const [showAndroidPicker, setShowAndroidPicker] = useState(false)
  const [markTransfer, setMarkTransfer] = useState(isTransfer)
  const [markReimbursed, setMarkReimbursed] = useState(isReimbursed)
  const [isNoteFocused, setIsNoteFocused] = useState(false)
  const scrollRef = useRef<ScrollView>(null)

  useEffect(() => {
    if (!isNoteFocused) return
    const subscription = Keyboard.addListener('keyboardDidShow', () => scrollRef.current?.scrollToEnd({ animated: true }))
    return () => subscription.remove()
  }, [isNoteFocused])

  function handleNoteFocus() {
    setIsNoteFocused(true)
    scrollRef.current?.scrollToEnd({ animated: true })
  }

  // The parent screen keeps one persistent instance of this sheet and only toggles `visible`,
  // so local state must be re-derived whenever it's reopened — for a different transaction,
  // for the edit -> create transition (transaction?.id goes to undefined), and for a second
  // create in a row, where the id never changes and only the `visible` flip says "new form".
  // Gated on visible so closing doesn't blank the fields mid exit-animation.
  useEffect(() => {
    if (!visible) return
    setType(transaction?.type ?? 'expense')
    setAmountText(transaction?.amount ?? '')
    setCategoryId(transaction?.categoryId ?? null)
    setSubcategoryId(transaction?.subcategoryId ?? null)
    setDate(transaction?.date ?? toDateKey(new Date()))
    setNote(transaction?.note ?? '')
    setMarkTransfer(isTransfer)
    setMarkReimbursed(isReimbursed)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transaction?.id, visible])

  const availableSubcategories = subcategories.filter((s) => s.categoryId === categoryId)
  const isValidAmount = /^\d+(\.\d{1,2})?$/.test(amountText) && Number(amountText) > 0

  const canMarkTransfer = transaction != null && onSaveAndMarkTransfer != null
  const canMarkReimbursement = transaction != null && onSaveAndMarkReimbursement != null

  function handleSave() {
    const input: ManualTransactionInput = {
      amount: amountText,
      type,
      categoryId,
      subcategoryId,
      date,
      note: note.trim().length > 0 ? note.trim() : null,
    }

    if (canMarkReimbursement && markReimbursed && !isReimbursed) {
      onSaveAndMarkReimbursement!(input)
    } else if (isReimbursed && !markReimbursed && onSaveAndUnmarkTransfer) {
      // Unmarking a reimbursement and unmarking a transfer are the same operation: drop the
      // item's links.
      onSaveAndUnmarkTransfer(input)
    } else if (canMarkTransfer && markTransfer && !isTransfer) {
      onSaveAndMarkTransfer!(input)
    } else if (isTransfer && !markTransfer && onSaveAndUnmarkTransfer) {
      onSaveAndUnmarkTransfer(input)
    } else {
      onSave(input)
    }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} contentScroll={sheetScroll}>
      <View className="flex-row items-center justify-between px-5 py-3">
        <Pressable onPress={onClose} hitSlop={8}>
          <Ionicons name="close" size={22} color={colors.textSecondary} />
        </Pressable>
        <Text className="font-display text-md text-textPrimary">
          {transaction ? 'Edit Transaction' : 'Add Transaction'}
        </Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView {...sheetScroll.scrollProps} ref={scrollRef} className="px-5" contentContainerClassName="gap-4 pb-10" keyboardShouldPersistTaps="handled">

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

        <TextField
          label="Note (optional)"
          value={note}
          onChangeText={setNote}
          placeholder="e.g. Street food, cash"
          onFocus={handleNoteFocus}
          onBlur={() => setIsNoteFocused(false)}
        />

        {canMarkReimbursement ? (
          <View className="flex-row items-center justify-between py-3">
            <Text className="flex-1 pr-3 font-sans text-base text-textPrimary">
              {type === 'expense' ? 'Mark as Reimbursed' : 'Mark as Reimbursement'}
            </Text>
            <Switch
              value={markReimbursed}
              onValueChange={(next) => {
                setMarkReimbursed(next)
                if (next) setMarkTransfer(false)
              }}
            />
          </View>
        ) : null}

        {canMarkTransfer ? (
          <View className="flex-row items-center justify-between py-3">
            <Text className="flex-1 pr-3 font-sans text-base text-textPrimary">Mark as Transfer</Text>
            <Switch
              value={markTransfer}
              onValueChange={(next) => {
                setMarkTransfer(next)
                if (next) setMarkReimbursed(false)
              }}
            />
          </View>
        ) : null}

        <View className="mt-4 gap-2">
          <Button label="Save Transaction" onPress={handleSave} disabled={!isValidAmount} loading={isSaving} />
          {onDelete ? <Button label="Delete Transaction" variant="ghost" onPress={onDelete} /> : null}
        </View>
      </ScrollView>
    </BottomSheet>
  )
}
