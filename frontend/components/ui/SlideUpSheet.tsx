import { useEffect, useState } from 'react'
import { Dimensions, Modal, Pressable, View } from 'react-native'
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming, Easing } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { borderRadius, colors } from '@/constants/theme'

const SCREEN_HEIGHT = Dimensions.get('window').height

interface SlideUpSheetProps {
  visible: boolean
  onClose: () => void
  children: React.ReactNode
  /** Distance from the top of the screen (default: safeArea.top + 60) */
  topOffset?: number
}

export function SlideUpSheet({ visible, onClose, children, topOffset }: SlideUpSheetProps) {
  const insets = useSafeAreaInsets()
  const translateY = useSharedValue(SCREEN_HEIGHT)
  const backdropOpacity = useSharedValue(0)
  const [isMounted, setIsMounted] = useState(false)

  const sheetTop = topOffset ?? insets.top + 60

  useEffect(() => {
    if (visible) {
      setIsMounted(true)
      translateY.value = withTiming(0, { duration: 350, easing: Easing.out(Easing.cubic) })
      backdropOpacity.value = withTiming(1, { duration: 300 })
    } else {
      translateY.value = withTiming(SCREEN_HEIGHT, { duration: 300, easing: Easing.in(Easing.cubic) }, (finished) => {
        if (finished) runOnJS(setIsMounted)(false)
      })
      backdropOpacity.value = withTiming(0, { duration: 250 })
    }
  }, [visible, translateY, backdropOpacity])

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }))

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }))

  if (!isMounted) return null

  return (
    <Modal transparent visible={isMounted} statusBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' }, backdropStyle]}>
          <Pressable style={{ flex: 1 }} onPress={onClose} />
        </Animated.View>

        <Animated.View
          style={[
            {
              position: 'absolute',
              top: sheetTop,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: colors.surface,
              borderTopLeftRadius: borderRadius.xl,
              borderTopRightRadius: borderRadius.xl,
            },
            sheetStyle,
          ]}
        >
          <View className="items-center pt-3 pb-1">
            <View className="h-1 w-10 rounded-full bg-border" />
          </View>
          {children}
        </Animated.View>
      </View>
    </Modal>
  )
}
