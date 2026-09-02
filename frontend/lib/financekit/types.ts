/**
 * The JSON contract of modules/expo-finance-kit. The Swift side flattens FinanceKit's Swift types
 * (notably the Account enum) into these plain objects and makes no other decisions, so every
 * mapping choice stays in TypeScript where it is testable without a device.
 */

export type AuthorizationStatus = 'notDetermined' | 'authorized' | 'denied' | 'restricted'

/**
 * FinanceKit's CreditDebitIndicator. Debit = money leaving the account.
 *
 * Carried as the raw Int16 the framework uses (0 = credit, 1 = debit) OR the string form, because
 * expo-finance-kit forwards `.rawValue` while typing it as a string union. Normalized in
 * financeKitModule.ts.
 */
export type CreditDebitIndicator = 'credit' | 'debit'

/** FinanceKit's TransactionStatus, lowercased by the module. */
export type TransactionStatus = 'authorized' | 'pending' | 'posted' | 'rejected' | 'memo' | 'booked'

export interface RawTransaction {
  id: string
  accountID: string
  /** Always non-negative; direction lives in creditDebitIndicator. */
  amount: number
  currencyCode: string
  creditDebitIndicator: CreditDebitIndicator
  transactionDescription: string
  originalTransactionDescription: string
  merchantName: string | null
  merchantCategoryCode: string | null
  status: TransactionStatus
  /** ISO 8601. */
  transactionDate: string
  /** ISO 8601, null until the transaction posts. */
  postedDate: string | null
}

/** FinanceKit's Account enum, flattened: `kind` is the case, the rest are the payload. */
export interface RawAccount {
  kind: 'asset' | 'liability'
  id: string
  displayName: string
  accountDescription: string | null
  institutionName: string
  currencyCode: string
  /** Liability accounts only. */
  creditLimit: number | null
  /**
   * The package's own computed balance: for a liability it is `creditLimit - available`, i.e. the
   * amount owed; for an asset it is the available balance. Used as the fallback when Apple reports
   * only an available balance and there is no booked figure to read.
   */
  balance: number | null
}

export interface RawBalance {
  accountID: string
  /** Whichever CurrentBalance cases Apple returned; either may be absent. */
  available: number | null
  booked: number | null
  currencyCode: string
}

export interface RawCreditInfo {
  creditLimit: number | null
}
