import { Text, View } from 'react-native'
import { Button } from './Button'

interface EmptyStateProps {
  message: string
  actionLabel?: string
  onAction?: () => void
}

export function EmptyState({ message, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View className="flex-1 items-center justify-center gap-4 px-8">
      <Text className="text-center font-sans text-base text-textMuted">{message}</Text>
      {actionLabel && onAction ? (
        <View className="w-full">
          <Button label={actionLabel} onPress={onAction} />
        </View>
      ) : null}
    </View>
  )
}
