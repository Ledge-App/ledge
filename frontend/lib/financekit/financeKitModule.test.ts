import { describe, expect, it, vi } from 'vitest'

const getTransactions = vi.fn()
const getBalances = vi.fn()
const getAccounts = vi.fn()

// expo-finance-kit is a native module: importing it under vitest would try to reach
// requireNativeModule. Mocked to the shape this adapter actually consumes.
vi.mock('expo-finance-kit', () => ({
  AccountType: { Asset: 'asset', Liability: 'liability' },
  BalanceType: { Available: 'available', Booked: 'booked', AvailableAndBooked: 'availableAndBooked' },
  getAccounts,
  getBalances,
  getTransactions,
  getAuthorizationStatus: async () => 'authorized',
  isFinanceKitAvailable: () => true,
  requestAuthorization: async () => ({ granted: true, status: 'authorized' }),
}))

const { financeKitModule } = await import('./financeKitModule')

function libTxn(overrides: Record<string, unknown> = {}) {
  return {
    id: 'fk-1',
    accountId: 'acc-1',
    amount: 12,
    currencyCode: 'USD',
    transactionDate: Date.UTC(2026, 7, 20),
    transactionDescription: 'VET CLINIC',
    merchantCategoryCode: 742,
    status: 'booked',
    transactionType: 'purchase',
    creditDebitIndicator: 'debit',
    ...overrides,
  }
}

describe('financeKitModule', () => {
  it('zero-pads a numeric MCC to the four-digit form the crosswalk is keyed on', async () => {
    getTransactions.mockResolvedValueOnce([libTxn()])
    const [txn] = await financeKitModule.fetchTransactions(null)
    expect(txn.merchantCategoryCode).toBe('0742')
  })

  it('carries a null MCC through when the package reports none', async () => {
    getTransactions.mockResolvedValueOnce([libTxn({ merchantCategoryCode: undefined })])
    const [txn] = await financeKitModule.fetchTransactions(null)
    expect(txn.merchantCategoryCode).toBeNull()
  })

  it('converts the epoch transaction date to an ISO string', async () => {
    getTransactions.mockResolvedValueOnce([libTxn()])
    const [txn] = await financeKitModule.fetchTransactions(null)
    expect(txn.transactionDate).toBe('2026-08-20T00:00:00.000Z')
  })

  it('asks for the whole history when no window start is given', async () => {
    getTransactions.mockResolvedValueOnce([])
    await financeKitModule.fetchTransactions(null)
    expect(getTransactions).toHaveBeenLastCalledWith({})
  })

  it('passes the window start as a startDate filter', async () => {
    getTransactions.mockResolvedValueOnce([])
    await financeKitModule.fetchTransactions('2026-08-01T00:00:00.000Z')
    expect(getTransactions).toHaveBeenLastCalledWith({ startDate: new Date('2026-08-01T00:00:00.000Z') })
  })

  it('maps a liability account type to the liability kind', async () => {
    getAccounts.mockResolvedValueOnce([
      { id: 'acc-1', institutionName: 'Apple Card', displayName: 'Apple Card', currencyCode: 'USD', accountType: 'liability', balance: 0 },
    ])
    const [account] = await financeKitModule.fetchAccounts()
    expect(account.kind).toBe('liability')
  })

  it('collapses several balance rows for one account into a single available/booked pair', async () => {
    getBalances.mockResolvedValueOnce([
      { id: 'b1', accountId: 'acc-1', amount: 400, currencyCode: 'USD', balanceType: 'available' },
      { id: 'b2', accountId: 'acc-1', amount: 100, currencyCode: 'USD', balanceType: 'booked' },
    ])
    const balances = await financeKitModule.fetchBalances()
    expect(balances).toEqual([{ accountID: 'acc-1', available: 400, booked: 100, currencyCode: 'USD' }])
  })

  it('reads the patched available and booked fields when both are present', async () => {
    getBalances.mockResolvedValueOnce([
      { id: 'b1', accountId: 'acc-1', amount: 8500, available: 8500, booked: 313.29, currencyCode: 'USD', balanceType: 'availableAndBooked' },
    ])
    const [balance] = await financeKitModule.fetchBalances()
    expect(balance).toMatchObject({ available: 8500, booked: 313.29 })
  })

  it('leaves booked null for a combined balance carrying only one amount', async () => {
    // Filling both sides from one number is exactly what showed a card's credit limit as its
    // balance, so an unknown booked side stays unknown.
    getBalances.mockResolvedValueOnce([
      { id: 'b1', accountId: 'acc-1', amount: 250, currencyCode: 'USD', balanceType: 'availableAndBooked' },
    ])
    const [balance] = await financeKitModule.fetchBalances()
    expect(balance).toMatchObject({ available: 250, booked: null })
  })

  it('decodes the numeric CreditDebitIndicator the framework actually sends', async () => {
    // FinanceKit's enum is Int16-backed and the package forwards .rawValue: 0 = credit, 1 = debit,
    // despite its TypeScript claiming a string union. Comparing against 'debit' made every
    // transaction a credit, which rendered every purchase as income.
    getTransactions.mockResolvedValueOnce([libTxn({ creditDebitIndicator: 1 }), libTxn({ creditDebitIndicator: 0 })])
    const [debit, credit] = await financeKitModule.fetchTransactions(null)
    expect(debit.creditDebitIndicator).toBe('debit')
    expect(credit.creditDebitIndicator).toBe('credit')
  })

  it('carries the patched postedDate and original description through', async () => {
    getTransactions.mockResolvedValueOnce([
      libTxn({ postedDate: Date.UTC(2026, 7, 22), originalTransactionDescription: 'VET CLINIC #42' }),
    ])
    const [txn] = await financeKitModule.fetchTransactions(null)
    expect(txn.postedDate).toBe('2026-08-22T00:00:00.000Z')
    expect(txn.originalTransactionDescription).toBe('VET CLINIC #42')
  })
})
