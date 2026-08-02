import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-native-mmkv', () => {
  class FakeMMKV {
    private store = new Map<string, string>()
    getString(key: string) {
      return this.store.get(key)
    }
    set(key: string, value: string) {
      this.store.set(key, value)
    }
  }
  return { MMKV: FakeMMKV }
})

describe('mmkv storage', () => {
  beforeEach(() => vi.resetModules())

  it('round-trips cached transactions per item, defaulting to an empty array', async () => {
    const { getCachedTransactions, setCachedTransactions } = await import('./mmkv')
    expect(getCachedTransactions('item-1')).toEqual([])

    const txns = [{ transaction_id: 't1' }] as never
    setCachedTransactions('item-1', txns)

    expect(getCachedTransactions('item-1')).toEqual(txns)
  })

  it('round-trips the sync cursor per item, independent of other items', async () => {
    const { getCursor, setCursor } = await import('./mmkv')
    expect(getCursor('item-1')).toBeUndefined()

    setCursor('item-1', 'cursor-abc')
    setCursor('item-2', 'cursor-xyz')

    expect(getCursor('item-1')).toBe('cursor-abc')
    expect(getCursor('item-2')).toBe('cursor-xyz')
  })
})
