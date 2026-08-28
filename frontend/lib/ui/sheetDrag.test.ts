import { describe, expect, it } from 'vitest'
import { DRAG_START_THRESHOLD_PX, shouldDismissOnRelease, shouldStartSheetDrag } from './sheetDrag'

describe('shouldStartSheetDrag', () => {
  const down = { dy: DRAG_START_THRESHOLD_PX + 1, dx: 0 }

  it('starts on a downward drag while the content sits at the top', () => {
    expect(shouldStartSheetDrag(down, { contentOffsetY: 0, respectScrollPosition: true })).toBe(true)
  })

  // The reason the offset gate exists: on a fast downward flick the JS responder can beat the
  // native scroll recognizer, and dismissing mid-list steals a gesture meant to scroll back up.
  it('does not start over scrolled content, where a downward drag means scroll', () => {
    expect(shouldStartSheetDrag(down, { contentOffsetY: 240, respectScrollPosition: true })).toBe(false)
  })

  // The grabber has nothing under it to scroll, so a downward pull there can only mean dismiss.
  // Applying the content rule to it made the sheet's most obvious close affordance go dead the
  // moment the list underneath had been scrolled, which is most of the time.
  it('starts from the grabber no matter how far the content is scrolled', () => {
    expect(shouldStartSheetDrag(down, { contentOffsetY: 240, respectScrollPosition: false })).toBe(true)
  })

  // A sheet with no scrollable reports offset 0 forever, so its content region drags like chrome.
  it('starts anywhere on a sheet that has no scrollable', () => {
    expect(shouldStartSheetDrag(down, { contentOffsetY: 0, respectScrollPosition: false })).toBe(true)
  })

  it('ignores upward movement, which is a scroll in either region', () => {
    expect(shouldStartSheetDrag({ dy: -40, dx: 0 }, { contentOffsetY: 0, respectScrollPosition: false })).toBe(false)
  })

  it('ignores a mostly horizontal swipe', () => {
    expect(shouldStartSheetDrag({ dy: 10, dx: 40 }, { contentOffsetY: 0, respectScrollPosition: false })).toBe(false)
  })

  // A press with no movement never reaches this, but a few pixels of travel during one does —
  // the threshold is what keeps a tap on the grabber from becoming a dismiss.
  it('ignores movement below the threshold', () => {
    expect(
      shouldStartSheetDrag({ dy: DRAG_START_THRESHOLD_PX, dx: 0 }, { contentOffsetY: 0, respectScrollPosition: false }),
    ).toBe(false)
  })
})

describe('shouldDismissOnRelease', () => {
  it('dismisses on a long drag', () => {
    expect(shouldDismissOnRelease({ dy: 140, vy: 0 })).toBe(true)
  })

  // A flick counts too, so dismissing never requires dragging the whole sheet off screen.
  it('dismisses on a short fast flick', () => {
    expect(shouldDismissOnRelease({ dy: 20, vy: 1.2 })).toBe(true)
  })

  it('springs back on a short slow drag', () => {
    expect(shouldDismissOnRelease({ dy: 20, vy: 0.1 })).toBe(false)
  })
})
