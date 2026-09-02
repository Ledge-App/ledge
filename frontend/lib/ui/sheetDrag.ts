/**
 * The decision behind a bottom sheet's drag-to-dismiss, kept out of the gesture handler so it can be
 * reasoned about and tested on its own. The handler supplies the movement; what that movement
 * *means* lives here.
 *
 * A worklet: it is called from the UI thread by the grabber's pan gesture.
 *
 * shouldStartSheetDrag used to live here too, deciding whether a drag over the sheet's *content*
 * became a sheet drag or stayed a scroll. It is gone with the gesture it served: arbitrating content
 * touches required manualActivation, and three separate paths through that arbitration failed to
 * resolve a touch — each one holding it and freezing the app, since a full-screen Modal leaves input
 * nowhere else to go. The grabber needs no such decision.
 */

/**
 * 6px rather than 2: large enough that the travel during an ordinary tap never reads as a drag, small
 * enough that the grabber responds promptly.
 */
export const DRAG_START_THRESHOLD_PX = 6

/** Past this, releasing dismisses however slowly the finger was moving. */
const DISMISS_DISTANCE_PX = 110
/** Below the distance, this much downward speed dismisses anyway — a flick, not a drag. */
const DISMISS_VELOCITY = 0.8

/** Whether releasing here dismisses the sheet, or springs it back to open. */
export function shouldDismissOnRelease(gesture: { dy: number; vy: number }): boolean {
  'worklet'
  return gesture.dy > DISMISS_DISTANCE_PX || gesture.vy > DISMISS_VELOCITY
}
