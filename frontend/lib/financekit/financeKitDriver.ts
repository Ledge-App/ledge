import type { AdaptedAccount } from './adaptAccount'
import { clearFinanceKitData, getCachedTransactions } from './store'
import { runFinanceKitSync, type FinanceKitModule, type FinanceKitSyncStatus } from './syncEngine'
import { toFeedTransactions, type FeedTransaction } from './toFeedTransactions'

/**
 * Singular owner of the FinanceKit read.
 *
 * A module-level driver rather than state inside a hook, for the same reason syncDriver is one:
 * useAccounts is called from eight components, so anything that lives inside it runs eight times.
 * Per-component refs cannot guard against that — the guard has to sit outside React, where there is
 * exactly one of it.
 *
 * Cheaper than syncDriver because the read is local: no cursors, no rate limits, no per-item
 * isolation. Just in-flight collapsing and a cooldown so remounts are free.
 */
export interface FinanceKitSnapshot {
  status: FinanceKitSyncStatus | null
  /** Adapted Apple accounts, ready for useAccounts to concatenate. */
  accounts: AdaptedAccount[]
  transactions: FeedTransaction[]
  isSyncing: boolean
  error: Error | null
  /** Bumped after each completed run, for consumers that need to know something landed. */
  completedAt: number
}

const COOLDOWN_MS = 30_000

const EMPTY_TRANSACTIONS: FeedTransaction[] = []
const EMPTY_ACCOUNTS: AdaptedAccount[] = []

export function createFinanceKitDriver(financeKit: FinanceKitModule) {
  let snapshot: FinanceKitSnapshot = {
    status: null,
    accounts: EMPTY_ACCOUNTS,
    transactions: EMPTY_TRANSACTIONS,
    isSyncing: false,
    error: null,
    completedAt: 0,
  }
  let listeners = new Set<() => void>()
  let inFlight: Promise<void> | null = null
  let lastRunAt = 0

  function publish(next: Partial<FinanceKitSnapshot>): void {
    snapshot = { ...snapshot, ...next }
    for (const listener of listeners) listener()
  }

  async function run(requestIfNeeded: boolean): Promise<void> {
    publish({ isSyncing: true, error: null })
    try {
      const result = await runFinanceKitSync(financeKit, { requestIfNeeded })
      publish({
        status: result.status,
        accounts: result.accounts,
        // Re-derived through toFeedTransactions on every run: that is where the MCC crosswalk is
        // applied, so a crosswalk fix reaches cached rows without a refetch.
        transactions: result.accounts.flatMap((account) =>
          toFeedTransactions(getCachedTransactions(account.account_id)),
        ),
        isSyncing: false,
        completedAt: Date.now(),
      })
    } catch (error) {
      // Surfaced on the snapshot rather than thrown: a FinanceKit failure must not blank the
      // accounts screen, and the watermark was not advanced so the window is retried.
      publish({
        isSyncing: false,
        error: error instanceof Error ? error : new Error(String(error)),
        completedAt: Date.now(),
      })
    } finally {
      lastRunAt = Date.now()
      inFlight = null
    }
  }

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },

    /** Stable between reads, which useSyncExternalStore requires to avoid an infinite loop. */
    getSnapshot(): FinanceKitSnapshot {
      return snapshot
    },

    /**
     * Drops every cached Apple record and resets the snapshot.
     *
     * Note what this cannot do: iOS permission stays granted, so the very next read brings the
     * accounts back. That is why the settings screen sends the user to iOS Settings straight after
     * — clearing locally is only half of removing, and the copy says so.
     */
    forget(): void {
      clearFinanceKitData()
      publish({
        status: null,
        accounts: EMPTY_ACCOUNTS,
        transactions: EMPTY_TRANSACTIONS,
        error: null,
        completedAt: Date.now(),
      })
    },

    /**
     * Resolves to the snapshot as of after the run — including when the cooldown or an in-flight
     * run suppressed a fresh read, so a caller can always branch on the outcome (the Apple Card row
     * needs to know a request came back denied) without racing React state.
     */
    async syncNow(options: { force?: boolean; requestIfNeeded?: boolean } = {}): Promise<FinanceKitSnapshot> {
      if (inFlight) {
        await inFlight
        return snapshot
      }
      if (!options.force && lastRunAt !== 0 && Date.now() - lastRunAt < COOLDOWN_MS) return snapshot

      inFlight = run(options.requestIfNeeded ?? false)
      await inFlight
      return snapshot
    },
  }
}

export type FinanceKitDriver = ReturnType<typeof createFinanceKitDriver>
