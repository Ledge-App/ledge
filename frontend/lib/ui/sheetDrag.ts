/**
 * The two decisions behind a bottom sheet's drag-to-dismiss, kept out of the gesture handler so
 * they can be reasoned about and tested on their own. The handler supplies the movement;
 * everything about what that movement *means* lives here.
 *
 * Both are worklets: they are called from the UI thread by the sheet's pan gesture.
 */

/**
 * 6px rather than 2: a smaller threshold hijacks the first pixels of a vertical scroll, in the gap
 * before a child scrollable claims the gesture. Large enough that the travel during an ordinary tap
 * never reads as a drag.
 */
export const DRAG_START_THRESHOLD_PX = 6

export interface DragContext {
  /** How far the sheet's scrollable content is scrolled. 0 when it has none. */
  contentOffsetY: number
  /**
   * Whether the scroll position gets a veto. True for the sheet's content region, where a downward
   * drag is ambiguous; false for the grabber, where there is nothing underneath to scroll and a
   * downward pull can only mean dismiss.
   */
  respectScrollPosition: boolean
}

/**
 * Whether a move gesture should become a sheet drag.
 *
 * Downward-only and vertical-dominant, so horizontal swipes and upward scrolls pass through. The
 * interesting part is the offset gate: over scrollable content a downward drag is ambiguous — it
 * usually means "scroll back up" — and deferring to the child by claiming only on move is not
 * enough, because on a fast flick the JS responder can still win the race. So over content, the
 * sheet only takes the gesture when there is nothing left to scroll back to.
 *
 * Outside the scrollable that ambiguity does not exist: there is nothing there to scroll, so a
 * downward pull can only mean dismiss. Applying the content rule everywhere meant the grabber, the
 * title bar and any header card all stopped responding the moment the list underneath them was
 * scrolled — which is most of the time a sheet is open.
 */
export function shouldStartSheetDrag(gesture: { dy: number; dx: number }, context: DragContext): boolean {
  'worklet'
  if (gesture.dy <= DRAG_START_THRESHOLD_PX) return false
  if (Math.abs(gesture.dy) <= Math.abs(gesture.dx)) return false
  if (!context.respectScrollPosition) return true
  return context.contentOffsetY <= 0
}

/** Past this, releasing dismisses however slowly the finger was moving. */
const DISMISS_DISTANCE_PX = 110
/** Below the distance, this much downward speed dismisses anyway — a flick, not a drag. */
const DISMISS_VELOCITY = 0.8

/** Whether releasing here dismisses the sheet, or springs it back to open. */
export function shouldDismissOnRelease(gesture: { dy: number; vy: number }): boolean {
  'worklet'
  return gesture.dy > DISMISS_DISTANCE_PX || gesture.vy > DISMISS_VELOCITY
}
