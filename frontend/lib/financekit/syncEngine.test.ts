import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdaptedTransaction } from './adaptTransaction'
import type { AuthorizationStatus, RawAccount, RawBalance, RawTransaction } from './types'

const cached = new Map<string, AdaptedTransaction[]>()
let lastSyncedAt: string | null = null
let cleared = false

vi.mock('./store', () => ({
  ensureSchemaCurrent: () => {},
  getLastSyncedAt: () => lastSyncedAt,
  setLastSyncedAt: (iso: string) => void (lastSyncedAt = iso),
  getCachedTransactions: (accountId: string) => cached.get(accountId) ?? [],
  setCachedTransactions: (accountId: string, txns: AdaptedTransaction[]) => void cached.set(accountId, txns),
  clearFinanceKitData: () => {
    cleared = true
    lastSyncedAt = null
    cached.clear()
  },
}))

const { runFinanceKitSync } = await import('./syncEngine')

const card: RawAccount = {
  kind: 'liability',
  id: 'acc-card',
  displayName: 'Apple Card',
  accountDescription: null,
  institutionName: 'Apple Card',
  currencyCode: 'USD',
  creditLimit: 5000,
  balance: 313.29,
}

function rawTxn(id: string): RawTransaction {
  return {
    id,
    accountID: 'acc-card',
    amount: 5,
    currencyCode: 'USD',
    creditDebitIndicator: 'debit',
    transactionDescription: id,
    originalTransactionDescription: id,
    merchantName: null,
    merchantCategoryCode: '5814',
    status: 'posted',
    transactionDate: '2026-08-20T00:00:00.000Z',
    postedDate: '2026-08-21T00:00:00.000Z',
  }
}

function fakeModule(overrides: Partial<Parameters<typeof runFinanceKitSync>[0]> = {}) {
  const balance: RawBalance = { accountID: 'acc-card', available: 4000, booked: 1000, currencyCode: 'USD' }
  return {
    isDataAvailable: () => true,
    authorizationStatus: async (): Promise<AuthorizationStatus> => 'authorized',
    requestAuthorization: async (): Promise<AuthorizationStatus> => 'authorized',
    fetchAccounts: async () => [card],
    fetchBalances: async () => [balance],
    fetchTransactions: async () => [rawTxn('t1')],
    ...overrides,
  }
}

const NOW = new Date('2026-08-31T12:00:00.000Z')

const adaptedStub: AdaptedTransaction = {
  transaction_id: 'stub',
  account_id: 'acc-card',
  name: 'stub',
  original_description: null,
  merchant_name: null,
  mcc: null,
  amount: 1,
  iso_currency_code: 'USD',
  date: '2026-08-01',
  transactionDate: '2026-08-01T00:00:00.000Z',
  pending: false,
  personal_finance_category: null,
}

beforeEach(() => {
  cached.clear()
  lastSyncedAt = null
  cleared = false
})

describe('runFinanceKitSync', () => {
  it('adapts and returns the accounts FinanceKit reports', async () => {
    const result = await runFinanceKitSync(fakeModule(), { now: NOW })

    expect(result.status).toBe('authorized')
    expect(result.accounts).toHaveLength(1)
    expect(result.accounts[0]).toMatchObject({ account_id: 'acc-card', type: 'credit', itemId: 'financekit' })
    expect(result.accounts[0].balances.available).toBe(4000)
  })

  it('bounds the first sync to two years rather than reading the whole history', async () => {
    const fetchTransactions = vi.fn(async () => [])

    await runFinanceKitSync(fakeModule({ fetchTransactions }), { now: NOW })

    // Unbounded would pull the account's entire history, and every later sync then pays
    // full-history cost on the MMKV write, the crosswalk pass, and the feed array.
    expect(fetchTransactions).toHaveBeenCalledWith('2024-08-31T12:00:00.000Z')
  })

  it('re-reads a trailing overlap window on later syncs, so pending rows that posted are corrected', async () => {
    lastSyncedAt = '2026-08-30T12:00:00.000Z'
    const fetchTransactions = vi.fn(async () => [])

    await runFinanceKitSync(fakeModule({ fetchTransactions }), { now: NOW })

    // 7 days before the last sync, not the last sync itself: a charge can post days after it was
    // authorized, changing a row already on the far side of the previous watermark.
    expect(fetchTransactions).toHaveBeenCalledWith('2026-08-23T12:00:00.000Z')
  })

  it('advances the watermark only after the merge lands', async () => {
    await runFinanceKitSync(fakeModule(), { now: NOW })
    expect(lastSyncedAt).toBe('2026-08-31T12:00:00.000Z')
  })

  it('leaves the watermark alone when the read fails, so the window is retried', async () => {
    lastSyncedAt = '2026-08-30T12:00:00.000Z'
    const fetchTransactions = async () => {
      throw new Error('FinanceKit read failed')
    }

    await expect(runFinanceKitSync(fakeModule({ fetchTransactions }), { now: NOW })).rejects.toThrow()
    expect(lastSyncedAt).toBe('2026-08-30T12:00:00.000Z')
  })

  it('merges the window read into the cached transactions for the account', async () => {
    await runFinanceKitSync(fakeModule(), { now: NOW })
    expect(cached.get('acc-card')?.map((t) => t.transaction_id)).toEqual(['t1'])
  })

  it('drops a cached in-window row the account no longer reports', async () => {
    lastSyncedAt = '2026-08-30T12:00:00.000Z'
    cached.set('acc-card', [
      { ...adaptedStub, transaction_id: 'vanished', date: '2026-08-29', transactionDate: '2026-08-29T00:00:00.000Z' },
      { ...adaptedStub, transaction_id: 'ancient', date: '2020-01-01', transactionDate: '2020-01-01T00:00:00.000Z' },
    ])

    await runFinanceKitSync(fakeModule({ fetchTransactions: async () => [] }), { now: NOW })

    // 'ancient' predates the window so it survives; 'vanished' was in-window and unreported.
    expect(cached.get('acc-card')?.map((t) => t.transaction_id)).toEqual(['ancient'])
  })

  it('does not touch the device when FinanceKit data is unavailable', async () => {
    const fetchAccounts = vi.fn()
    const result = await runFinanceKitSync(fakeModule({ isDataAvailable: () => false, fetchAccounts }), { now: NOW })

    expect(result.status).toBe('unavailable')
    expect(fetchAccounts).not.toHaveBeenCalled()
  })

  it('reports denied without requesting authorization unprompted', async () => {
    const requestAuthorization = vi.fn(async (): Promise<AuthorizationStatus> => 'authorized')
    const result = await runFinanceKitSync(fakeModule({ authorizationStatus: async () => 'denied', requestAuthorization }), { now: NOW })

    expect(result.status).toBe('denied')
    expect(requestAuthorization).not.toHaveBeenCalled()
  })

  it('requests authorization only when explicitly asked to', async () => {
    const requestAuthorization = vi.fn(async (): Promise<AuthorizationStatus> => 'authorized')
    const result = await runFinanceKitSync(
      fakeModule({ authorizationStatus: async () => 'notDetermined', requestAuthorization }),
      { requestIfNeeded: true },
    )

    expect(requestAuthorization).toHaveBeenCalledOnce()
    expect(result.status).toBe('authorized')
  })

  it('clears stored data when access has been revoked', async () => {
    cached.set('acc-card', [])
    lastSyncedAt = '2026-08-30T12:00:00.000Z'

    await runFinanceKitSync(fakeModule({ authorizationStatus: async () => 'denied' }), { now: NOW })

    expect(cleared).toBe(true)
  })
})
