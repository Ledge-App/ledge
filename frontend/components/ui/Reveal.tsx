import { useEffect, type ReactNode } from 'react'
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'

const RISE = 12
const DURATION = 450

interface RevealProps {
  delay?: number
  children: ReactNode
}

// A single staggered mount entrance, for screens where the first impression is the whole
// design (design.md's motion rules favour one orchestrated moment over scattered
// micro-interactions). Under reduce-motion this degrades to an instant state change rather
// than a faster animation — the setting means "no movement", not "less movement".
export function Reveal({ delay = 0, children }: RevealProps) {
  const reduceMotion = useReducedMotion()
  const progress = useSharedValue(reduceMotion ? 1 : 0)

  useEffect(() => {
    if (reduceMotion) {
      progress.value = 1
      return
    }
    progress.value = withDelay(delay, withTiming(1, { duration: DURATION, easing: Easing.out(Easing.cubic) }))
  }, [delay, progress, reduceMotion])

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * RISE }],
  }))

  return <Animated.View style={style}>{children}</Animated.View>
}
