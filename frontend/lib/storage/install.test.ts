import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-native-mmkv', () => {
  class FakeMMKV {
    private store = new Map<string, boolean>()
    getBoolean(key: string) {
      return this.store.get(key)
    }
    set(key: string, value: boolean) {
      this.store.set(key, value)
    }
  }
  return { MMKV: FakeMMKV }
})

describe('install marker', () => {
  beforeEach(() => vi.resetModules())

  it('is absent on a fresh install, which is the reinstall signal', async () => {
    const { hasInstallMarker } = await import('./install')
    expect(hasInstallMarker()).toBe(false)
  })

  it('is present on every launch after the first', async () => {
    const { hasInstallMarker, setInstallMarker } = await import('./install')
    setInstallMarker()
    expect(hasInstallMarker()).toBe(true)
  })
})
