import {
  AccountType,
  BalanceType,
  getAccounts,
  getAuthorizationStatus,
  getBalances,
  getTransactions,
  isFinanceKitAvailable,
  requestAuthorization,
  type Account as LibAccount,
  type AccountBalance as LibBalance,
  type Transaction as LibTransaction,
} from 'expo-finance-kit'
import type { FinanceKitModule } from './syncEngine'
import type { AuthorizationStatus, RawAccount, RawBalance, RawTransaction } from './types'

/**
 * expo-finance-kit → the FinanceKitModule contract syncEngine and the adapters are tested against.
 *
 * The whole point of this file is that it is the only place the dependency appears. The raw types in
 * types.ts model FinanceKit itself rather than this package, so if upstream is abandoned or gains
 * the fields it currently drops, only this file changes.
 *
 * The package drops or mistypes several things FinanceKit provides. `postedDate`,
 * `originalTransactionDescription`, `creditLimit`, and the available/booked balance split are
 * restored by patches/expo-finance-kit+0.2.23.patch, so the local interfaces below declare fields
 * the package's own types do not. Still missing, and not worth patching for: the liability
 * account's nextPaymentDueDate and minimumNextPaymentAmount.
 *
 * The indicator needs normalizing rather than patching: FinanceKit's CreditDebitIndicator is an
 * Int16 enum and the package forwards `.rawValue`, so what actually arrives is 0 or 1 while its
 * TypeScript claims 'credit' | 'debit'. Accepting both forms means an upstream fix would not break
 * us. Getting this wrong inverted every amount, which rendered every Apple Card purchase as income.
 */

/** The package's types, plus the fields the patch adds. */
type PatchedTransaction = LibTransaction & {
  originalTransactionDescription?: string | null
  postedDate?: number | null
}
type PatchedAccount = LibAccount & { creditLimit?: number | null }
type PatchedBalance = LibBalance & { available?: number | null; booked?: number | null }

function toStatus(status: Awaited<ReturnType<typeof getAuthorizationStatus>>): AuthorizationStatus {
  // The package's 'unavailable' is reported through isDataAvailable instead, so it maps to the
  // closest FinanceKit-native status: the OS will not serve this data.
  return status === 'unavailable' ? 'restricted' : status
}

/**
 * 0 = credit, 1 = debit, matching the case order in FinanceKit's Int16-backed enum. Strings are
 * accepted too, in case upstream ever honours its own type.
 */
function toIndicator(value: unknown): RawTransaction['creditDebitIndicator'] {
  if (value === 1 || value === '1' || value === 'debit') return 'debit'
  return 'credit'
}

function toRawAccount(account: PatchedAccount): RawAccount {
  return {
    kind: account.accountType === AccountType.Liability ? 'liability' : 'asset',
    id: account.id,
    displayName: account.displayName,
    accountDescription: account.accountDescription ?? null,
    institutionName: account.institutionName,
    currencyCode: account.currencyCode,
    creditLimit: account.creditLimit ?? null,
    balance: account.balance ?? null,
  }
}

/**
 * Collapses the package's per-balance rows into one RawBalance per account.
 *
 * Reads the patched `available` / `booked` fields directly. Before the patch the package returned a
 * single `amount` — taking `available` even for an availableAndBooked balance — and no balanceType
 * at all, so both sides were filled with the available credit and a card's balance displayed as its
 * limit. `amount` is the fallback for a row carrying only one side.
 */
function toRawBalances(balances: PatchedBalance[]): RawBalance[] {
  const byAccount = new Map<string, RawBalance>()

  for (const balance of balances) {
    const existing = byAccount.get(balance.accountId) ?? {
      accountID: balance.accountId,
      available: null,
      booked: null,
      currencyCode: balance.currencyCode,
    }

    // Per row, not against the accumulated state: a second row carrying only `amount` must still
    // land on its own side rather than being suppressed by what the first row already filled in.
    if (balance.available != null || balance.booked != null) {
      if (balance.available != null) existing.available = balance.available
      if (balance.booked != null) existing.booked = balance.booked
    } else if (balance.balanceType === BalanceType.Booked) {
      existing.booked = balance.amount
    } else {
      // Includes availableAndBooked, whose single `amount` is the available side. Leaving booked
      // null is the honest answer — filling both with the same number is what displayed a card's
      // credit limit as its balance.
      existing.available = balance.amount
    }

    byAccount.set(balance.accountId, existing)
  }

  return [...byAccount.values()]
}

/**
 * The package types MCC as a number; ISO 18245 codes are four digits and the crosswalk is keyed on
 * the zero-padded string form. Without padding, 742 (veterinary services) would never match the
 * '0742' entry and every such charge would land in Uncategorized.
 */
function toMcc(code: number | undefined): string | null {
  return code === undefined || code === null ? null : String(code).padStart(4, '0')
}

function toRawTransaction(txn: PatchedTransaction): RawTransaction {
  return {
    id: txn.id,
    accountID: txn.accountId,
    amount: txn.amount,
    currencyCode: txn.currencyCode,
    creditDebitIndicator: toIndicator(txn.creditDebitIndicator),
    transactionDescription: txn.transactionDescription,
    originalTransactionDescription: txn.originalTransactionDescription ?? txn.transactionDescription,
    merchantName: txn.merchantName ?? null,
    merchantCategoryCode: toMcc(txn.merchantCategoryCode),
    status: txn.status as RawTransaction['status'],
    transactionDate: new Date(txn.transactionDate).toISOString(),
    postedDate: txn.postedDate != null ? new Date(txn.postedDate).toISOString() : null,
  }
}

export const financeKitModule: FinanceKitModule = {
  isDataAvailable: () => isFinanceKitAvailable(),

  authorizationStatus: async () => toStatus(await getAuthorizationStatus()),

  requestAuthorization: async () => toStatus((await requestAuthorization()).status),

  fetchAccounts: async () => (await getAccounts()).map(toRawAccount),

  fetchBalances: async () => toRawBalances(await getBalances()),

  fetchTransactions: async (since) =>
    (await getTransactions(since ? { startDate: new Date(since) } : {})).map(toRawTransaction),
}
