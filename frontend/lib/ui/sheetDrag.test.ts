import { describe, expect, it } from 'vitest'
import { shouldDismissOnRelease } from './sheetDrag'

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
