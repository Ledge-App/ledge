import { describe, expect, it } from 'vitest'
import { shouldResetCache } from './shouldResetCache'

const ALICE = 'aaaaaaaa-0000-0000-0000-000000000001'
const BOB = 'bbbbbbbb-0000-0000-0000-000000000002'

describe('shouldResetCache', () => {
  it('does not reset on the first observed event, when the cache is still empty', () => {
    expect(shouldResetCache(undefined, ALICE)).toBe(false)
    expect(shouldResetCache(undefined, null)).toBe(false)
  })

  it('resets on sign-out, so the signed-out user\'s data cannot outlive the session', () => {
    expect(shouldResetCache(ALICE, null)).toBe(true)
  })

  it('resets when a different user signs in', () => {
    expect(shouldResetCache(ALICE, BOB)).toBe(true)
  })

  it('does not reset on events that leave identity unchanged, such as a token refresh', () => {
    expect(shouldResetCache(ALICE, ALICE)).toBe(false)
    expect(shouldResetCache(null, null)).toBe(false)
  })

  it('resets on sign-in after a sign-out, covering the full account-switch sequence', () => {
    // The reported symptom: alice -> signed out -> bob, all without restarting the app.
    const events: Array<string | null> = [ALICE, null, BOB]
    let previous: string | null | undefined = undefined
    const resets: boolean[] = []
    for (const next of events) {
      resets.push(shouldResetCache(previous, next))
      previous = next
    }
    expect(resets).toEqual([false, true, true])
  })
})
