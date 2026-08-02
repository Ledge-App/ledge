import { Pressable, ScrollView, Text } from 'react-native'
import { hexToRgba } from '@/constants/theme'
import type { Category } from '@/types/domain'

interface CategoryPickerProps {
  categories: Category[]
  selectedCategoryId: string | null
  onSelect: (categoryId: string) => void
}

export function CategoryPicker({ categories, selectedCategoryId, onSelect }: CategoryPickerProps) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3">
      {categories.map((category) => {
        const isSelected = category.id === selectedCategoryId
        return (
          <Pressable
            key={category.id}
            onPress={() => onSelect(category.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            className="w-20 items-center gap-2 rounded-md p-3"
            style={{
              backgroundColor: hexToRgba(category.color, isSelected ? 0.28 : 0.16),
              borderWidth: isSelected ? 2 : 0,
              borderColor: category.color,
            }}
          >
            <Text style={{ fontSize: 22 }}>{category.icon}</Text>
            <Text className="text-center font-sansMed text-xs text-textPrimary" numberOfLines={1}>
              {category.name}
            </Text>
          </Pressable>
        )
      })}
    </ScrollView>
  )
}
