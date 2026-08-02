import { useEffect } from 'react'
import { Modal, Pressable, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import { borderRadius, colors } from '@/constants/theme'

interface BottomSheetProps {
  visible: boolean
  onClose: () => void
  children: React.ReactNode
}

// Base primitive for every bottom sheet in the app (category picker, reimbursement sheet,
// add/edit manual transaction sheet — built in later sub-projects on top of this).
export function BottomSheet({ visible, onClose, children }: BottomSheetProps) {
  const translateY = useSharedValue(600)

  useEffect(() => {
    translateY.value = withSpring(visible ? 0 : 600, { damping: 20, stiffness: 180 })
  }, [visible, translateY])

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }))

  if (!visible) return null

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-black/40" onPress={onClose} accessibilityLabel="Close">
        <Pressable onPress={() => {}}>
          <Animated.View
            style={[
              { backgroundColor: colors.surface, borderTopLeftRadius: borderRadius.xl, borderTopRightRadius: borderRadius.xl },
              animatedStyle,
            ]}
            className="max-h-[85%] px-5 pb-8 pt-3"
          >
            <View className="mb-4 h-1 w-10 self-center rounded-full bg-border" />
            {children}
          </Animated.View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}
