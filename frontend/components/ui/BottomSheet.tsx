import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Dimensions, KeyboardAvoidingView, Modal, Platform, Pressable, View } from 'react-native'
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { borderRadius, colors } from '@/constants/theme'
import { DRAG_START_THRESHOLD_PX, shouldDismissOnRelease, shouldStartSheetDrag } from '@/lib/ui/sheetDrag'

const SCREEN_HEIGHT = Dimensions.get('window').height

/** RNGH reports velocity in px/s; the dismiss rule is written in px/ms, as PanResponder had it. */
const MS_PER_S = 1000

/** Past this much horizontal travel the gesture is a swipe, not a sheet drag. */
const HORIZONTAL_SLOP_PX = 20

/**
 * Pairs a BottomSheet with the scrollable rendered inside it, so a drag over that scrollable only
 * dismisses while it sits at the top. Without this the sheet's pan competes with the scroll: a
 * downward drag meant to scroll back through content would dismiss the sheet instead.
 *
 *   const sheetScroll = useSheetScroll()
 *   <BottomSheet contentScroll={sheetScroll} ...>
 *     <ScrollView {...sheetScroll.scrollProps} ...>
 *
 * The grabber is never subject to this — nothing under it can scroll. A sheet with no scrollable
 * omits the prop and reads as permanently at the top, i.e. draggable anywhere.
 *
 * offsetY is a shared value rather than a ref because the gesture that reads it runs on the UI
 * thread, where a React ref is not visible.
 */
export function useSheetScroll() {
  const offsetY = useSharedValue(0)
  return useMemo(
    () => ({
      offsetY,
      scrollProps: {
        scrollEventThrottle: 16,
        onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
          offsetY.value = event.nativeEvent.contentOffset.y
        },
      },
    }),
    [offsetY],
  )
}

export type SheetScroll = ReturnType<typeof useSheetScroll>

interface BottomSheetProps {
  visible: boolean
  onClose: () => void
  children: React.ReactNode
  topOffset?: number
  /** From useSheetScroll — makes drags over the content wait until it is scrolled to the top. */
  contentScroll?: SheetScroll
}

export function BottomSheet({ visible, onClose, children, topOffset, contentScroll }: BottomSheetProps) {
  const insets = useSafeAreaInsets()
  const translateY = useSharedValue(SCREEN_HEIGHT)
  const backdropOpacity = useSharedValue(0)
  const [isMounted, setIsMounted] = useState(false)

  const sheetTop = topOffset ?? insets.top + 60

  const onCloseRef = useRef(onClose)
  // In an effect rather than assigned during render: a render-phase write is a side effect, and
  // under StrictMode's double render or a discarded concurrent render it happens for a tree that
  // never commits.
  useEffect(() => {
    onCloseRef.current = onClose
  })
  /** Stable identity for runOnJS — a gesture worklet cannot read a React ref. */
  const requestClose = useCallback(() => onCloseRef.current(), [])

  // Mounting and animating are two effects, deliberately. Doing both at once started the entrance
  // on the UI thread in the same tick that queued the mount — so on any slow mount the sheet was
  // already partway through its 350ms by the time the Modal existed, and appeared halfway up or
  // simply snapped into place. Now the animation begins only once the sheet is actually on screen.
  useEffect(() => {
    if (visible) setIsMounted(true)
  }, [visible])

  useEffect(() => {
    if (!isMounted) return
    if (visible) {
      // Explicit, not assumed: an interrupted close (or a drag released mid-flight) can leave
      // translateY anywhere, and animating from there would play a partial entrance.
      translateY.value = SCREEN_HEIGHT
      translateY.value = withTiming(0, { duration: 350, easing: Easing.out(Easing.cubic) })
      backdropOpacity.value = withTiming(1, { duration: 300 })
    } else {
      translateY.value = withTiming(SCREEN_HEIGHT, { duration: 300, easing: Easing.in(Easing.cubic) }, (finished) => {
        if (finished) runOnJS(setIsMounted)(false)
      })
      backdropOpacity.value = withTiming(0, { duration: 250 })
    }
  }, [visible, isMounted, translateY, backdropOpacity])

  // Gesture-handler rather than PanResponder: under the New Architecture the JS responder system
  // never runs its *move* negotiation for a view that declined the touch on start, so
  // onMoveShouldSetPanResponder was simply never called and drag-to-dismiss could not work at all.
  // Verified by instrumentation — raw touch events arrived, the negotiation did not. RNGH sits on
  // the native recognizers instead, and its pan runs as a worklet, so dragging no longer round
  // trips through JS on every frame.
  const contentOffset = contentScroll?.offsetY
  // Where the touch went down, so the manually-activated gesture below can measure its own
  // translation: RNGH only fills in translationX/Y once a gesture has activated, which is the very
  // thing being decided.
  const startX = useSharedValue(0)
  const startY = useSharedValue(0)

  /** Shared by both gestures: drag the sheet with the finger, fading the backdrop as it goes. */
  const trackFinger = useCallback(
    (translationY: number) => {
      'worklet'
      if (translationY <= 0) return
      translateY.value = translationY
      backdropOpacity.value = Math.max(0, 1 - translationY / (SCREEN_HEIGHT * 0.5))
    },
    [translateY, backdropOpacity],
  )

  /** Shared by both gestures: dismiss, or spring back to open. */
  const settle = useCallback(
    (translationY: number, velocityY: number) => {
      'worklet'
      if (shouldDismissOnRelease({ dy: translationY, vy: velocityY / MS_PER_S })) {
        // Hand off to the `visible` effect, which animates from wherever the finger left the
        // sheet down to offscreen and then unmounts it.
        runOnJS(requestClose)()
        return
      }
      translateY.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.cubic) })
      backdropOpacity.value = withTiming(1, { duration: 200 })
    },
    [translateY, backdropOpacity, requestClose],
  )

  /**
   * The grabber's gesture. Nothing under it can scroll, so it activates on any downward drag and
   * needs no negotiation — this is the sheet's one guaranteed close affordance.
   */
  const grabberGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY(DRAG_START_THRESHOLD_PX)
        .failOffsetX([-HORIZONTAL_SLOP_PX, HORIZONTAL_SLOP_PX])
        .onUpdate((event) => trackFinger(event.translationY))
        .onEnd((event) => settle(event.translationY, event.velocityY)),
    [trackFinger, settle],
  )

  /**
   * The content's gesture, which must not steal a scroll.
   *
   * manualActivation is what makes that safe: it watches the touch without claiming it, and only
   * activates once the movement is unambiguously a downward sheet drag with nothing left to scroll
   * back to. Over scrolled content it fails instead, handing the touch back untouched. Letting it
   * auto-activate on a downward offset would cancel the scroll every time someone swiped back up
   * through a list.
   *
   * This covers the header too — the title, the balance card, anything a caller renders outside its
   * own ScrollView. Those have no scroll of their own to protect, but they share this gesture, so
   * while the content is scrolled they stay undraggable along with it. The grabber is the escape
   * hatch that always works.
   */
  const contentGesture = useMemo(
    () =>
      Gesture.Pan()
        .manualActivation(true)
        .onTouchesDown((event) => {
          const touch = event.allTouches[0]
          if (!touch) return
          startX.value = touch.absoluteX
          startY.value = touch.absoluteY
        })
        .onTouchesMove((event, manager) => {
          const touch = event.allTouches[0]
          if (!touch) return
          const dy = touch.absoluteY - startY.value
          const dx = touch.absoluteX - startX.value
          if (
            shouldStartSheetDrag({ dy, dx }, { contentOffsetY: contentOffset?.value ?? 0, respectScrollPosition: true })
          ) {
            manager.activate()
            return
          }
          // Committed to scrolling up, or to a horizontal swipe. Failing releases the touch rather
          // than leaving this gesture watching it to the end.
          if (dy < -DRAG_START_THRESHOLD_PX || Math.abs(dx) > HORIZONTAL_SLOP_PX) manager.fail()
        })
        .onUpdate((event) => trackFinger(event.translationY))
        .onEnd((event) => settle(event.translationY, event.velocityY)),
    [contentOffset, startX, startY, trackFinger, settle],
  )

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }))

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }))

  if (!isMounted) return null

  return (
    <Modal transparent visible={isMounted} statusBarTranslucent onRequestClose={onClose}>
      {/* Required INSIDE the Modal: RN mounts modal content in its own native view hierarchy, which
          sits outside any root-level gesture handler, so gestures registered here would never be
          recognized without a root of their own. */}
      <GestureHandlerRootView style={{ flex: 1 }}>
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
          {/* The sheet is pinned to the bottom of the screen, so an open keyboard sits on top of
              its lowest fields — the note input on the transaction form, for one. Shrinking the
              sheet by the keyboard's overlap keeps every field inside a scrollable, visible area.
              Android resizes the window itself, where 'height' measures no overlap and no-ops. */}
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <GestureDetector gesture={grabberGesture}>
              {/* Full-width strip, not just the 40px pill: the whole band above the content reads
                  as the grab area, and a target the width of the sheet is what makes the gesture
                  findable. */}
              <View className="items-center pt-3 pb-3">
                <View className="h-1 w-10 rounded-full bg-border" />
              </View>
            </GestureDetector>
            <GestureDetector gesture={contentGesture}>
              <View style={{ flex: 1 }}>{children}</View>
            </GestureDetector>
          </KeyboardAvoidingView>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  )
}
