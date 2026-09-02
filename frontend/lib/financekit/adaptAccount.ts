import type { Account } from '@/types/domain'
import type { RawAccount, RawBalance } from './types'

/**
 * FinanceKit account → the normalized account shape useAccounts already merges and sorts.
 *
 * Shaped like Plaid's AccountBase plus the app's { itemId, institutionName, institutionLogo }
 * extension, so account ordering, institution grouping, net worth composition, and the item-error
 * channel all work with no special cases. `itemId` is the synthetic constant 'financekit' — that
 * one value is what buys all of it.
 */
/**
 * Deliberately the app's own Account type rather than a parallel shape: every consumer of
 * useAccounts stays typed as before and none of them learns FinanceKit exists.
 */
export type AdaptedAccount = Account

/**
 * Plaid's `type` and `subtype` are declared as TypeScript string enums, so a plain literal is not
 * assignable even though the runtime value is exactly that string. Casting here rather than
 * importing the enum keeps the `plaid` package out of the mobile bundle — the same reason
 * types/domain.ts only ever imports types from the backend.
 */
const asType = (value: string) => value as unknown as Account['type']
const asSubtype = (value: string) => value as unknown as Account['subtype']

/**
 * FinanceKit has no account-type enum — an asset account's kind comes from its display name. Apple
 * Cash is a prepaid balance rather than a savings account, and the distinction matters because net
 * worth composition and the brokerage-cash predicates read subtype.
 */
function subtypeOf(raw: RawAccount): Account['subtype'] {
  if (raw.kind === 'liability') return asSubtype('credit card')
  return asSubtype(/cash/i.test(raw.displayName) ? 'prepaid' : 'savings')
}

function currentBalanceOf(raw: RawAccount, balance: RawBalance | undefined): number | null {
  const owed = balance?.booked ?? raw.balance
  return owed != null ? Math.abs(owed) : null
}

export function adaptAccount(raw: RawAccount, balance: RawBalance | undefined): AdaptedAccount {
  return {
    account_id: raw.id,
    name: raw.displayName,
    official_name: raw.accountDescription,
    type: asType(raw.kind === 'liability' ? 'credit' : 'depository'),
    subtype: subtypeOf(raw),
    // FinanceKit exposes no PAN digits. Plaid can also return null here, so consumers already
    // handle it.
    mask: null,
    balances: {
      // Plaid's convention for a card: `current` is what you owe, `available` is the credit left.
      // FinanceKit's booked balance is the former and its available balance the latter, which is
      // why taking `available` for both — as the upstream package does — showed the credit limit
      // where the balance belongs. Magnitude, because Plaid reports a card's current balance
      // positive when money is owed.
      available: balance?.available ?? null,
      // booked first, then the package's computed balance. Apple does not always report a booked
      // side — when it reports only `available`, booked is null and reading it alone showed $0.00
      // for every Apple account. Magnitude, because Plaid reports a card's current balance
      // positive when money is owed.
      current: currentBalanceOf(raw, balance),
      limit: raw.creditLimit,
      iso_currency_code: raw.currencyCode,
      // Plaid populates this only for currencies outside its ISO list; FinanceKit is USD-only in
      // the US, so it is always null. Present because Account requires it.
      unofficial_currency_code: null,
    },
    itemId: 'financekit',
    institutionName: raw.institutionName,
    institutionLogo: null,
  }
}
