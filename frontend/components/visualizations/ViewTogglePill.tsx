import { Pressable, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { borderRadius, colors } from '@/constants/theme'

interface ViewTogglePillProps {
  vizMode: boolean
  onToggle: () => void
}

export function ViewTogglePill({ vizMode, onToggle }: ViewTogglePillProps) {
  return (
    <View
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: 'transparent',
        alignItems: 'center',
        paddingVertical: 6,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          backgroundColor: colors.surfaceRaised,
          borderRadius: borderRadius.full,
          padding: 3,
          gap: 2,
        }}
      >
        <Pressable
          onPress={vizMode ? onToggle : undefined}
          accessibilityRole="button"
          accessibilityLabel="Grid view"
          accessibilityState={{ selected: !vizMode }}
          style={{
            width: 56,
            height: 24,
            borderRadius: borderRadius.full,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: !vizMode ? colors.primaryMuted : 'transparent',
          }}
        >
          <Ionicons name="apps" size={14} color={!vizMode ? colors.primary : colors.textMuted} />
        </Pressable>
        <Pressable
          onPress={vizMode ? undefined : onToggle}
          accessibilityRole="button"
          accessibilityLabel="Chart view"
          accessibilityState={{ selected: vizMode }}
          style={{
            width: 56,
            height: 24,
            borderRadius: borderRadius.full,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: vizMode ? colors.primaryMuted : 'transparent',
          }}
        >
          <Ionicons name="pie-chart" size={14} color={vizMode ? colors.primary : colors.textMuted} />
        </Pressable>
      </View>
    </View>
  )
}
