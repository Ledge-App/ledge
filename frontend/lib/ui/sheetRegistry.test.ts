import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getHostPresented,
  getSheetLayers,
  removeSheetLayer,
  resetSheetRegistry,
  setHostPresented,
  setSheetLayer,
  subscribeHostPresented,
  subscribeSheetLayers,
} from './sheetRegistry'

beforeEach(() => resetSheetRegistry())

describe('sheetRegistry', () => {
  it('returns an identical snapshot between reads when nothing changed', () => {
    setSheetLayer('a', 'A')
    // useSyncExternalStore re-renders forever if getSnapshot returns a fresh array each call.
    expect(getSheetLayers()).toBe(getSheetLayers())
  })

  it('publishes a new snapshot after a change', () => {
    setSheetLayer('a', 'A')
    const before = getSheetLayers()
    setSheetLayer('b', 'B')
    expect(getSheetLayers()).not.toBe(before)
  })

  it('orders layers by when they first registered, not by id', () => {
    setSheetLayer('z', 'Z')
    setSheetLayer('a', 'A')
    expect(getSheetLayers().map((layer) => layer.node)).toEqual(['Z', 'A'])
  })

  it('keeps a layer in place when its content is replaced', () => {
    // A sheet re-registers on every render; that must not lift it above the sheet it opened.
    setSheetLayer('outer', 'OUTER')
    setSheetLayer('inner', 'INNER')
    setSheetLayer('outer', 'OUTER v2')
    expect(getSheetLayers().map((layer) => layer.node)).toEqual(['OUTER v2', 'INNER'])
  })

  it('preserves the order of the survivors when one is removed', () => {
    setSheetLayer('a', 'A')
    setSheetLayer('b', 'B')
    setSheetLayer('c', 'C')
    removeSheetLayer('b')
    expect(getSheetLayers().map((layer) => layer.node)).toEqual(['A', 'C'])
  })

  it('notifies subscribers on change and stops after unsubscribe', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeSheetLayers(listener)
    setSheetLayer('a', 'A')
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
    setSheetLayer('b', 'B')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('does not notify when removing a layer that was never registered', () => {
    const listener = vi.fn()
    subscribeSheetLayers(listener)
    removeSheetLayer('nope')
    expect(listener).not.toHaveBeenCalled()
  })

  it('empties when the last layer leaves, so the host presents nothing', () => {
    // The host renders its Modal only while layers exist. A layer left behind here would keep a
    // full-screen backdrop presented over the app with nothing visible in it — the shape of the
    // freeze this whole design removes.
    setSheetLayer('only', 'a')
    removeSheetLayer('only')
    expect(getSheetLayers()).toEqual([])
  })

  it('presents again cleanly after emptying', () => {
    setSheetLayer('first', 'a')
    removeSheetLayer('first')
    setSheetLayer('second', 'b')
    expect(getSheetLayers().map((layer) => layer.id)).toEqual(['second'])
  })

  it('removes every layer independently, leaving no stragglers', () => {
    setSheetLayer('account', 'a')
    setSheetLayer('edit', 'b')
    removeSheetLayer('edit')
    expect(getSheetLayers().map((layer) => layer.id)).toEqual(['account'])
    removeSheetLayer('account')
    expect(getSheetLayers()).toEqual([])
  })
})


/**
 * The presentation flag gates every sheet's entrance animation, so what matters here is not that it
 * stores a boolean but that it only wakes subscribers on a real change: a redundant notification
 * re-runs the effect that starts the entrance, restarting an animation already in flight.
 */
describe('host presentation', () => {
  it('starts unpresented', () => {
    expect(getHostPresented()).toBe(false)
  })

  it('notifies subscribers when the presentation state changes', () => {
    const listener = vi.fn()
    subscribeHostPresented(listener)
    setHostPresented(true)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(getHostPresented()).toBe(true)
  })

  it('does not notify when the state is reported again unchanged', () => {
    setHostPresented(true)
    const listener = vi.fn()
    subscribeHostPresented(listener)
    // onShow and the layers-emptied effect can both report the same state.
    setHostPresented(true)
    expect(listener).not.toHaveBeenCalled()
  })

  it('stops notifying once unsubscribed', () => {
    const listener = vi.fn()
    subscribeHostPresented(listener)()
    setHostPresented(true)
    expect(listener).not.toHaveBeenCalled()
  })
})
