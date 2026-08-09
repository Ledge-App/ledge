import { describe, expect, it } from 'vitest'
import { planCachePrune } from './pruneOrphaned'
import type { PlaidTransaction } from '@/types/domain'

function txn(transaction_id: string, account_id: string): PlaidTransaction {
  return { transaction_id, account_id } as PlaidTransaction
}

describe('planCachePrune', () => {
  it('drops transactions from an account that is no longer shared', () => {
    const plan = planCachePrune({
      itemIds: ['item-chase'],
      cachedByItem: new Map([['item-chase', [txn('t1', 'sapphire'), txn('t2', 'freedom')]]]),
      liveAccountIdsByItem: new Map([['item-chase', new Set(['sapphire'])]]),
      failedItemIds: new Set(),
    })

    expect(plan.get('item-chase')).toEqual([txn('t1', 'sapphire')])
  })

  it('returns nothing when every cached transaction still has an account', () => {
    const plan = planCachePrune({
      itemIds: ['item-chase'],
      cachedByItem: new Map([['item-chase', [txn('t1', 'sapphire')]]]),
      liveAccountIdsByItem: new Map([['item-chase', new Set(['sapphire', 'freedom'])]]),
      failedItemIds: new Set(),
    })

    // Empty plan, not an unchanged copy — callers skip the MMKV write entirely.
    expect(plan.size).toBe(0)
  })

  it('leaves a failed item untouched, since invisible accounts are not deselected accounts', () => {
    const plan = planCachePrune({
      itemIds: ['item-broken'],
      cachedByItem: new Map([['item-broken', [txn('t1', 'sapphire')]]]),
      // A broken login returns no accounts at all — identical in shape to deselecting them all.
      liveAccountIdsByItem: new Map(),
      failedItemIds: new Set(['item-broken']),
    })

    expect(plan.size).toBe(0)
  })

  it('prunes a healthy item in the same round as a failed one', () => {
    const plan = planCachePrune({
      itemIds: ['item-broken', 'item-chase'],
      cachedByItem: new Map([
        ['item-broken', [txn('t1', 'old-checking')]],
        ['item-chase', [txn('t2', 'sapphire'), txn('t3', 'freedom')]],
      ]),
      liveAccountIdsByItem: new Map([['item-chase', new Set(['sapphire'])]]),
      failedItemIds: new Set(['item-broken']),
    })

    expect(plan.has('item-broken')).toBe(false)
    expect(plan.get('item-chase')).toEqual([txn('t2', 'sapphire')])
  })

  it('empties an item whose accounts are all gone but which reported no error', () => {
    const plan = planCachePrune({
      itemIds: ['item-chase'],
      cachedByItem: new Map([['item-chase', [txn('t1', 'sapphire')]]]),
      liveAccountIdsByItem: new Map(),
      failedItemIds: new Set(),
    })

    expect(plan.get('item-chase')).toEqual([])
  })

  it('ignores items with no cache to prune', () => {
    const plan = planCachePrune({
      itemIds: ['item-fresh'],
      cachedByItem: new Map([['item-fresh', []]]),
      liveAccountIdsByItem: new Map([['item-fresh', new Set(['checking'])]]),
      failedItemIds: new Set(),
    })

    expect(plan.size).toBe(0)
  })
})
