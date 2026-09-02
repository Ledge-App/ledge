import { describe, expect, it, vi } from 'vitest'
import type { AdaptedTransaction } from './adaptTransaction'

const cached = new Map<string, AdaptedTransaction[]>()
vi.mock('./store', () => ({
  ensureSchemaCurrent: () => {},
  getLastSyncedAt: () => null,
  setLastSyncedAt: () => {},
  getCachedTransactions: (id: string) => cached.get(id) ?? [],
  setCachedTransactions: (id: string, t: AdaptedTransaction[]) => void cached.set(id, t),
  clearFinanceKitData: () => void cached.clear(),
}))

const { createFinanceKitDriver } = await import('./financeKitDriver')

function fakeModule(overrides: Record<string, unknown> = {}) {
  return {
    isDataAvailable: () => true,
    authorizationStatus: async () => 'authorized' as const,
    requestAuthorization: async () => 'authorized' as const,
    fetchAccounts: async () => [
      {
        kind: 'liability' as const,
        id: 'acc-card',
        displayName: 'Apple Card',
        accountDescription: null,
        institutionName: 'Apple Card',
        currencyCode: 'USD',
        creditLimit: null,
        balance: 0,
      },
    ],
    fetchBalances: async () => [],
    fetchTransactions: async () => [],
    ...overrides,
  }
}

describe('financeKitDriver', () => {
  it('collapses concurrent syncs into one underlying read', async () => {
    const fetchAccounts = vi.fn(fakeModule().fetchAccounts)
    const driver = createFinanceKitDriver(fakeModule({ fetchAccounts }))

    await Promise.all([driver.syncNow(), driver.syncNow(), driver.syncNow()])

    // The bug this guards: useAccounts is called from eight components, so eight mounts must not
    // mean eight reads.
    expect(fetchAccounts).toHaveBeenCalledOnce()
  })

  it('treats a second unforced sync as a no-op, so remounts are free', async () => {
    const fetchAccounts = vi.fn(fakeModule().fetchAccounts)
    const driver = createFinanceKitDriver(fakeModule({ fetchAccounts }))

    await driver.syncNow()
    await driver.syncNow()

    expect(fetchAccounts).toHaveBeenCalledOnce()
  })

  it('runs again when a sync is forced, which is what pull-to-refresh needs', async () => {
    const fetchAccounts = vi.fn(fakeModule().fetchAccounts)
    const driver = createFinanceKitDriver(fakeModule({ fetchAccounts }))

    await driver.syncNow()
    await driver.syncNow({ force: true })

    expect(fetchAccounts).toHaveBeenCalledTimes(2)
  })

  it('returns an identical snapshot object until something changes', () => {
    const driver = createFinanceKitDriver(fakeModule())
    // useSyncExternalStore re-renders forever if getSnapshot returns a fresh object each call.
    expect(driver.getSnapshot()).toBe(driver.getSnapshot())
  })

  it('publishes a new snapshot and notifies subscribers once a sync completes', async () => {
    const driver = createFinanceKitDriver(fakeModule())
    const before = driver.getSnapshot()
    const listener = vi.fn()
    driver.subscribe(listener)

    await driver.syncNow()

    expect(listener).toHaveBeenCalled()
    expect(driver.getSnapshot()).not.toBe(before)
    expect(driver.getSnapshot().status).toBe('authorized')
  })

  it('stops notifying a listener that unsubscribed', async () => {
    const driver = createFinanceKitDriver(fakeModule())
    const listener = vi.fn()
    driver.subscribe(listener)()

    await driver.syncNow()

    expect(listener).not.toHaveBeenCalled()
  })

  it('surfaces a failed read as an error without throwing at the call site', async () => {
    const driver = createFinanceKitDriver(
      fakeModule({ fetchAccounts: async () => { throw new Error('read failed') } }),
    )

    await driver.syncNow()

    expect(driver.getSnapshot().error).toBeInstanceOf(Error)
    expect(driver.getSnapshot().isSyncing).toBe(false)
  })

  it('publishes the adapted accounts, which is what useAccounts merges', async () => {
    const driver = createFinanceKitDriver(fakeModule())

    await driver.syncNow()

    expect(driver.getSnapshot().accounts).toHaveLength(1)
    expect(driver.getSnapshot().accounts[0]).toMatchObject({ account_id: 'acc-card', itemId: 'financekit' })
  })

  it('resolves syncNow to the resulting snapshot, so a caller can react to a denial', async () => {
    const driver = createFinanceKitDriver(fakeModule({ authorizationStatus: async () => 'denied' }))

    const outcome = await driver.syncNow({ requestIfNeeded: true })

    expect(outcome.status).toBe('denied')
  })

  it('resolves to the current snapshot when the cooldown suppressed the run', async () => {
    const driver = createFinanceKitDriver(fakeModule())
    await driver.syncNow()

    const outcome = await driver.syncNow()

    expect(outcome.status).toBe('authorized')
  })
})
