import { useEffect, useMemo, useRef, useState } from 'react'
import { Dimensions, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, View } from 'react-native'
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native'
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { borderRadius, colors } from '@/constants/theme'

const SCREEN_HEIGHT = Dimensions.get('window').height

/**
 * Pairs a BottomSheet with the scrollable rendered inside it, so drag-to-dismiss only engages
 * while that scrollable sits at the top. Without this the sheet's PanResponder races the
 * native scroll gesture and can win mid-list: a downward drag meant to scroll back through
 * content dismisses the sheet instead.
 *
 *   const sheetScroll = useSheetScroll()
 *   <BottomSheet contentScroll={sheetScroll} ...>
 *     <ScrollView {...sheetScroll.scrollProps} ...>
 *
 * A sheet without a scrollable simply omits the prop and keeps whole-sheet drag-to-dismiss.
 */
export function useSheetScroll() {
  const offsetY = useRef(0)
  return useMemo(
    () => ({
      offsetY,
      scrollProps: {
        scrollEventThrottle: 16,
        onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
          offsetY.current = event.nativeEvent.contentOffset.y
        },
      },
    }),
    [],
  )
}

export type SheetScroll = ReturnType<typeof useSheetScroll>

interface BottomSheetProps {
  visible: boolean
  onClose: () => void
  children: React.ReactNode
  topOffset?: number
  /** From useSheetScroll — restricts drag-to-dismiss to when the content is scrolled to the top. */
  contentScroll?: SheetScroll
}

export function BottomSheet({ visible, onClose, children, topOffset, contentScroll }: BottomSheetProps) {
  const insets = useSafeAreaInsets()
  const translateY = useSharedValue(SCREEN_HEIGHT)
  const backdropOpacity = useSharedValue(0)
  const [isMounted, setIsMounted] = useState(false)

  const sheetTop = topOffset ?? insets.top + 60

  // Kept in refs so the PanResponder below can be built once and still read the latest
  // values — rebuilding it mid-gesture would drop the drag.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const contentScrollRef = useRef(contentScroll)
  contentScrollRef.current = contentScroll

  useEffect(() => {
    if (visible) {
      setIsMounted(true)
      // The content remounts at the top on open, but no scroll event fires to say so — a stale
      // offset from the previous open would wrongly disable drag-to-dismiss.
      if (contentScrollRef.current) contentScrollRef.current.offsetY.current = 0
      translateY.value = withTiming(0, { duration: 350, easing: Easing.out(Easing.cubic) })
      backdropOpacity.value = withTiming(1, { duration: 300 })
    } else {
      translateY.value = withTiming(SCREEN_HEIGHT, { duration: 300, easing: Easing.in(Easing.cubic) }, (finished) => {
        if (finished) runOnJS(setIsMounted)(false)
      })
      backdropOpacity.value = withTiming(0, { duration: 250 })
    }
  }, [visible, translateY, backdropOpacity])

  // Drag-to-dismiss covers the whole sheet, not just the grabber — a 28px strip is far too
  // small a target to discover, and pulling on the title or the content is what people
  // actually try. Taps are untouched, since a press with no movement never reaches
  // onMoveShouldSetPanResponder.
  //
  // Deferring to a child ScrollView by claiming only on move (never on capture) is not enough
  // on its own: on a fast downward drag the JS responder can still win before the native
  // scroll recognizer does, dismissing the sheet while the user is scrolling back through
  // content. So dismissal additionally requires the content's scrollable (reported through
  // the contentScroll prop) to be at the top — the only place a downward drag can't mean
  // "scroll". Sheets that pass no contentScroll read as always-at-top, i.e. the old behavior.
  //
  // RN's built-in PanResponder avoids taking on react-native-gesture-handler, which is only
  // a transitive peer here and so isn't guaranteed to be linked into the native build.
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // 6px rather than 2: a small threshold would hijack the start of a vertical scroll
        // in the gap before a child claims it.
        onMoveShouldSetPanResponder: (_, gesture) =>
          (contentScrollRef.current?.offsetY.current ?? 0) <= 0 && gesture.dy > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderMove: (_, gesture) => {
          if (gesture.dy <= 0) return
          translateY.value = gesture.dy
          backdropOpacity.value = Math.max(0, 1 - gesture.dy / (SCREEN_HEIGHT * 0.5))
        },
        onPanResponderRelease: (_, gesture) => {
          // A short flick counts as well as a long drag, so dismissing never needs a full swipe.
          if (gesture.dy > 110 || gesture.vy > 0.8) {
            // Hand off to the `visible` effect, which animates from wherever the finger left
            // the sheet down to offscreen and then unmounts it.
            onCloseRef.current()
            return
          }
          translateY.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.cubic) })
          backdropOpacity.value = withTiming(1, { duration: 200 })
        },
      }),
    [translateY, backdropOpacity],
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
          {...panResponder.panHandlers}
        >
          {/* The sheet is pinned to the bottom of the screen, so an open keyboard sits on top of
              its lowest fields — the note input on the transaction form, for one. Shrinking the
              sheet by the keyboard's overlap keeps every field inside a scrollable, visible area.
              Android resizes the window itself, where 'height' measures no overlap and no-ops. */}
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View className="items-center pt-3 pb-3">
              <View className="h-1 w-10 rounded-full bg-border" />
            </View>
            {children}
          </KeyboardAvoidingView>
        </Animated.View>
      </View>
    </Modal>
  )
}
