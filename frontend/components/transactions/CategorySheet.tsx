import { useEffect, useState } from 'react'
import { Pressable, ScrollView, Switch, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { CategoryPicker } from '@/components/categories/CategoryPicker'
import { Button } from '@/components/ui/Button'
import { formatAmount } from '@/lib/format/money'
import { colors } from '@/constants/theme'
import type { FeedItem } from '@/lib/transactions/resolveFeed'
import type { Category, Subcategory } from '@/types/domain'

interface CategorySheetProps {
  visible: boolean
  item: FeedItem | null
  categories: Category[]
  subcategories: Subcategory[]
  onClose: () => void
  onSave: (input: { categoryId: string; subcategoryId: string | null; applyToVendor: boolean }) => void
  onOpenReimbursement: (input: { categoryId: string; subcategoryId: string | null }) => void
}

export function CategorySheet({ visible, item, categories, subcategories, onClose, onSave, onOpenReimbursement }: CategorySheetProps) {
  const [categoryId, setCategoryId] = useState<string | null>(item?.categoryId ?? null)
  const [subcategoryId, setSubcategoryId] = useState<string | null>(item?.subcategoryId ?? null)
  const [applyToVendor, setApplyToVendor] = useState(true)
  const [markReimbursed, setMarkReimbursed] = useState(false)

  // The parent screen keeps one persistent instance of this sheet and only toggles `visible`,
  // so local state must be re-derived whenever the sheet is reopened for a different item.
  useEffect(() => {
    setCategoryId(item?.categoryId ?? null)
    setSubcategoryId(item?.subcategoryId ?? null)
    setApplyToVendor(true)
    setMarkReimbursed(false)
  }, [item?.id])

  if (!item) return null

  const availableSubcategories = subcategories.filter((s) => s.categoryId === categoryId)

  function handleSave() {
    if (!categoryId) return
    if (markReimbursed) {
      onOpenReimbursement({ categoryId, subcategoryId })
    } else {
      onSave({ categoryId, subcategoryId, applyToVendor })
    }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View className="flex-row items-center justify-between px-5 py-3">
        <Pressable onPress={onClose} hitSlop={8}>
          <Ionicons name="close" size={22} color={colors.textSecondary} />
        </Pressable>
        <Text className="font-display text-md text-textPrimary">{item.merchantName}</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView className="px-5" contentContainerClassName="gap-4 pb-10">
        <Text className="font-sans text-sm text-textSecondary">
          {item.date} · {formatAmount(item.amount)}
        </Text>

        <Text className="font-sansMed text-sm text-textSecondary">Category</Text>
        <CategoryPicker categories={categories} selectedCategoryId={categoryId} onSelect={(id) => {
          setCategoryId(id)
          setSubcategoryId(null)
        }} />

        {availableSubcategories.length > 0 ? (
          <View className="flex-row flex-wrap gap-2">
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

        <View className="flex-row items-center justify-between py-3">
          <Text className="font-sans text-base text-textPrimary">Apply to all future {item.merchantName}?</Text>
          <Switch value={applyToVendor} onValueChange={setApplyToVendor} />
        </View>

        <View className="flex-row items-center justify-between py-3">
          <Text className="font-sans text-base text-textPrimary">Mark as Reimbursement</Text>
          <Switch value={markReimbursed} onValueChange={setMarkReimbursed} />
        </View>

        <Button label="Save Changes" onPress={handleSave} disabled={!categoryId} />
      </ScrollView>
    </BottomSheet>
  )
}
