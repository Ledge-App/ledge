import type { Ionicons } from '@expo/vector-icons'
import { colors } from '@/constants/theme'
import { isLiabilityAccount } from '@/lib/accounts/accountType'
import type { FeedItem } from '@/lib/transactions/resolveFeed'
import type { Account, TransferKind } from '@/types/domain'

export interface TransferContext {
  accounts: Account[]
}

// The contract every transfer type implements. Candidate matching lives on the client because
// Plaid transactions are never persisted server-side (transactionSyncService is a pure relay) —
// the backend has no transaction table to search, so it only validates and stores `kind`.
export interface TransferTypeDefinition {
  kind: TransferKind
  /** Chip text in TransferSheet and the badge text on both legs' rows. */
  label: string
  /** One-line explainer shown under the chips once selected. */
  description: string
  icon: keyof typeof Ionicons.glyphMap
  color: string
  /** Whether this type is offered at all for a given expense. */
  appliesTo(expense: FeedItem, ctx: TransferContext): boolean
  /** Whether `candidate` is a valid counterparty income leg for `expense`. */
  matches(expense: FeedItem, candidate: FeedItem, ctx: TransferContext): boolean
  /** Whether the type can be saved with no income leg linked. */
  allowsUnpaired: boolean
}

/** Whole days between two YYYY-MM-DD calendar keys, parsed as UTC so DST never shifts the count. */
export function daysBetween(a: string, b: string): number {
  const MS_PER_DAY = 24 * 60 * 60 * 1000
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / MS_PER_DAY
}

/**
 * Tolerance is a fraction of the EXPENSE amount, compared on absolute values — feed amounts
 * follow Plaid's convention where income is negative.
 */
export function amountWithinTolerance(pct: number) {
  return (expense: FeedItem, candidate: FeedItem): boolean =>
    Math.abs(Math.abs(candidate.amount) - Math.abs(expense.amount)) <= Math.abs(expense.amount) * pct
}

export function withinDays(days: number) {
  return (expense: FeedItem, candidate: FeedItem): boolean => daysBetween(expense.date, candidate.date) <= days
}

/**
 * A transfer moves money between two accounts, so the legs can't share one. Manual transactions
 * have accountId === null (they aren't tied to a connected account), and are never excluded here.
 */
export function differentAccount(expense: FeedItem, candidate: FeedItem): boolean {
  if (expense.accountId === null || candidate.accountId === null) return true
  return expense.accountId !== candidate.accountId
}

export function onLiabilityAccount(candidate: FeedItem, ctx: TransferContext): boolean {
  if (candidate.accountId === null) return false
  const account = ctx.accounts.find((a) => a.account_id === candidate.accountId)
  return account ? isLiabilityAccount(account) : false
}

const withinTolerance = amountWithinTolerance(0.05)
const withinWindow = withinDays(7)

function isBaseCounterparty(expense: FeedItem, candidate: FeedItem): boolean {
  return (
    candidate.amount < 0 &&
    candidate.id !== expense.id &&
    withinTolerance(expense, candidate) &&
    withinWindow(expense, candidate) &&
    differentAccount(expense, candidate)
  )
}

// Adding a kind to TRANSFER_KINDS in the backend widens the TransferKind union, and this Record
// then fails to typecheck until the new kind has a full definition here. That is the mechanism
// that makes "every transfer type defines itself under one interface" enforceable.
export const TRANSFER_TYPES: Record<TransferKind, TransferTypeDefinition> = {
  account_transfer: {
    kind: 'account_transfer',
    label: 'Between accounts',
    description: 'Money moved between two of your own accounts.',
    icon: 'swap-horizontal',
    color: colors.primary,
    appliesTo: () => true,
    matches: isBaseCounterparty,
    allowsUnpaired: true,
  },
  credit_card_payment: {
    kind: 'credit_card_payment',
    label: 'Credit card payment',
    description: 'A payment toward one of your credit cards or loans.',
    icon: 'card-outline',
    color: colors.transfer,
    appliesTo: () => true,
    matches: (expense, candidate, ctx) => isBaseCounterparty(expense, candidate) && onLiabilityAccount(candidate, ctx),
    allowsUnpaired: true,
  },
}

export const TRANSFER_TYPE_LIST: TransferTypeDefinition[] = Object.values(TRANSFER_TYPES)

export function transferTypeLabel(kind: TransferKind): string {
  return TRANSFER_TYPES[kind].label
}
