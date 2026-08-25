import { useMemo, useRef, useState } from 'react'
import { PanResponder, Pressable, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import type { ReactNode } from 'react'
import { colors } from '@/constants/theme'

/** How long a press must be held before the row lifts. Matches the iOS drag idiom. */
const LIFT_DELAY_MS = 250
/** Movement past this cancels a tap and starts moving the lifted row. */
const DRAG_THRESHOLD = 2
const SHIFT_DURATION_MS = 140

interface ReorderableListProps<T> {
  items: T[]
  keyExtractor: (item: T) => string
  /** Rendered inside the draggable wrapper. `isLifted` is for the raised-row treatment. */
  renderItem: (item: T, isLifted: boolean) => ReactNode
  /** Called on drop with the reordered array. Not called when the position is unchanged. */
  onReorder: (items: T[]) => void
  /** Lets the screen freeze its ScrollView while a row is in the air. */
  onDragStateChange?: (isDragging: boolean) => void
}

/**
 * Long-press-then-drag reordering, built on RN's own PanResponder rather than
 * react-native-gesture-handler — which is not a dependency here, and which would make this
 * a native module change (rebuild + App Store review) instead of an OTA-able JS one.
 *
 * The gesture has to coexist with two others already on these rows: a tap that opens the
 * account sheet, and the page's vertical scroll. Long-press arming is what separates all
 * three. A press that never reaches LIFT_DELAY_MS is a tap; a drag that starts before the
 * row lifts belongs to the ScrollView; only once armed does this claim the gesture. The
 * claim uses the CAPTURE phase because the row's own Pressable is already the responder by
 * then, and capture is the only way a parent takes a gesture back from its child.
 *
 * Deliberately no auto-scroll at the list edges. Account groups run 2-5 rows and collapse,
 * so a lifted row can always reach its target without the page moving — which removes the
 * fiddliest part of drag-to-reorder for a case that cannot arise here.
 */
export function ReorderableList<T>({
  items,
  keyExtractor,
  renderItem,
  onReorder,
  onDragStateChange,
}: ReorderableListProps<T>) {
  const [liftedIndex, setLiftedIndex] = useState<number | null>(null)
  const [targetIndex, setTargetIndex] = useState<number | null>(null)
  const dragY = useSharedValue(0)

  // Read inside the PanResponder, which is built once and would otherwise close over the
  // state as it was on first render.
  const armedRef = useRef(false)
  const liftedRef = useRef<number | null>(null)
  const targetRef = useRef<number | null>(null)
  const rowHeightRef = useRef(0)
  const itemsRef = useRef(items)
  itemsRef.current = items

  const endDrag = (commit: boolean) => {
    const from = liftedRef.current
    const to = targetRef.current
    armedRef.current = false
    liftedRef.current = null
    targetRef.current = null
    dragY.value = 0
    setLiftedIndex(null)
    setTargetIndex(null)
    onDragStateChange?.(false)
    if (commit && from != null && to != null && from !== to) {
      const next = [...itemsRef.current]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      onReorder(next)
    }
  }

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // Capture, not bubble: by the time a finger moves, the row's Pressable owns the
        // gesture, and only a capture-phase claim can take it back.
        onMoveShouldSetPanResponderCapture: (_, gesture) =>
          armedRef.current && Math.abs(gesture.dy) > DRAG_THRESHOLD,
        onPanResponderMove: (_, gesture) => {
          const from = liftedRef.current
          const height = rowHeightRef.current
          if (from == null || height <= 0) return
          dragY.value = gesture.dy
          const raw = from + Math.round(gesture.dy / height)
          const next = Math.max(0, Math.min(itemsRef.current.length - 1, raw))
          if (next !== targetRef.current) {
            targetRef.current = next
            setTargetIndex(next)
          }
        },
        onPanResponderRelease: () => endDrag(true),
        // A terminated gesture (an incoming call, a parent claiming back) must not commit a
        // half-finished move — the row returns to where it started.
        onPanResponderTerminate: () => endDrag(false),
        onPanResponderTerminationRequest: () => false,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  return (
    <View {...panResponder.panHandlers}>
      {items.map((item, index) => (
        <ReorderableRow
          key={keyExtractor(item)}
          index={index}
          liftedIndex={liftedIndex}
          targetIndex={targetIndex}
          dragY={dragY}
          onMeasure={(h) => {
            if (rowHeightRef.current === 0) rowHeightRef.current = h
          }}
          onLift={() => {
            armedRef.current = true
            liftedRef.current = index
            targetRef.current = index
            setLiftedIndex(index)
            setTargetIndex(index)
            onDragStateChange?.(true)
          }}
          onPressOut={() => {
            // Fires both when a press ends normally AND when the PanResponder takes the
            // gesture. Only the former should disarm, hence the in-flight check.
            if (liftedRef.current != null && targetRef.current === liftedRef.current) {
              if (dragY.value === 0) endDrag(false)
            }
          }}
        >
          {renderItem(item, index === liftedIndex)}
        </ReorderableRow>
      ))}
    </View>
  )
}

interface ReorderableRowProps {
  index: number
  liftedIndex: number | null
  targetIndex: number | null
  dragY: { value: number }
  onMeasure: (height: number) => void
  onLift: () => void
  onPressOut: () => void
  children: ReactNode
}

function ReorderableRow({
  index,
  liftedIndex,
  targetIndex,
  dragY,
  onMeasure,
  onLift,
  onPressOut,
  children,
}: ReorderableRowProps) {
  const isLifted = index === liftedIndex
  const height = useSharedValue(0)

  // How far this row steps aside to open a slot for the lifted one. Rows between the lift
  // point and the drop point shift by exactly one row, in the direction that closes the gap.
  let shift = 0
  if (liftedIndex != null && targetIndex != null && !isLifted) {
    if (liftedIndex < targetIndex && index > liftedIndex && index <= targetIndex) shift = -1
    else if (liftedIndex > targetIndex && index >= targetIndex && index < liftedIndex) shift = 1
  }

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: isLifted ? dragY.value : withTiming(shift * height.value, { duration: SHIFT_DURATION_MS }) },
      { scale: withTiming(isLifted ? 1.02 : 1, { duration: SHIFT_DURATION_MS }) },
    ],
  }))

  return (
    <Animated.View
      onLayout={(e) => {
        height.value = e.nativeEvent.layout.height
        onMeasure(e.nativeEvent.layout.height)
      }}
      style={[
        style,
        // Raised above its neighbours, and shadowed so it reads as picked up rather than
        // simply moved. Applied unanimated — a shadow that fades in lags the lift.
        isLifted
          ? {
              zIndex: 2,
              backgroundColor: colors.surface,
              borderRadius: 10,
              shadowColor: colors.textPrimary,
              shadowOpacity: 0.16,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 4 },
              elevation: 6,
            }
          : { zIndex: 0 },
      ]}
    >
      <Pressable delayLongPress={LIFT_DELAY_MS} onLongPress={onLift} onPressOut={onPressOut}>
        {children}
      </Pressable>
    </Animated.View>
  )
}
