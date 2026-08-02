import { useState } from 'react'
import { Switch, Text, View } from 'react-native'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { CategoryPicker } from '@/components/categories/CategoryPicker'
import { Button } from '@/components/ui/Button'
import { formatAmount } from '@/lib/format/money'
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
      <Text className="font-sansSemi text-lg text-textPrimary">{item.merchantName}</Text>
      <Text className="mb-4 font-sans text-sm text-textSecondary">
        {item.date} · {formatAmount(item.amount)}
      </Text>

      <Text className="mb-2 font-sansMed text-sm text-textSecondary">Category</Text>
      <CategoryPicker categories={categories} selectedCategoryId={categoryId} onSelect={(id) => {
        setCategoryId(id)
        setSubcategoryId(null)
      }} />

      {availableSubcategories.length > 0 ? (
        <View className="mt-4 flex-row flex-wrap gap-2">
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

      <View className="mt-4 flex-row items-center justify-between py-3">
        <Text className="font-sans text-base text-textPrimary">Apply to all future {item.merchantName}?</Text>
        <Switch value={applyToVendor} onValueChange={setApplyToVendor} />
      </View>

      <View className="flex-row items-center justify-between py-3">
        <Text className="font-sans text-base text-textPrimary">Mark as Reimbursement</Text>
        <Switch value={markReimbursed} onValueChange={setMarkReimbursed} />
      </View>

      <Button label="Save Changes" onPress={handleSave} disabled={!categoryId} />
    </BottomSheet>
  )
}
