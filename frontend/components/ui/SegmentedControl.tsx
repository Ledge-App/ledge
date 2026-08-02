import { Pressable, Text, View } from 'react-native'

interface SegmentedControlProps<T extends string> {
  options: Array<{ label: string; value: T }>
  value: T
  onChange: (value: T) => void
}

export function SegmentedControl<T extends string>({ options, value, onChange }: SegmentedControlProps<T>) {
  return (
    <View className="flex-row gap-2">
      {options.map((option) => {
        const isSelected = option.value === value
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            className={`h-11 flex-1 items-center justify-center rounded-md border ${
              isSelected ? 'border-primary bg-primaryMuted' : 'border-border bg-transparent'
            }`}
          >
            <Text className={`font-sansMed text-base ${isSelected ? 'text-primary' : 'text-textSecondary'}`}>
              {option.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}
