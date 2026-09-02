import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import TestRenderer, { act } from 'react-test-renderer'

/**
 * That `positionByAccountId` keeps its identity while the saved order does.
 *
 * Not a style point. useAccounts feeds this Map to the memo that sorts the account list, so a new
 * Map on every render means a new accounts array on every render — and accounts.data is the root of
 * the transaction feed. A fresh identity there re-derives itemIds, re-reads every cached Plaid
 * transaction out of MMKV, and rebuilds the whole feed, which then hands every transaction list a
 * dataset it has never seen and makes it rebuild its rows natively.
 *
 * Measured cost of that chain at 2200 feed rows, while an account sheet was trying to open: two
 * spurious feed rebuilds and roughly 450ms of native churn, on a sheet whose own React render is
 * 32ms. The sheet's 350ms entrance had finished before it was ever presented.
 */
let orderData: { accountId: string; position: number }[] = []

// Stable across renders, so the only identity this test can observe churning is the one it is about.
const mutation = { mutateAsync: async () => {}, error: null, reset: () => {} }
const utils = {
  accountOrders: {
    list: {
      cancel: async () => {},
      getData: () => undefined,
      setData: () => {},
      invalidate: async () => {},
    },
  },
}

vi.mock('@/lib/api/client', () => ({
  api: {
    useUtils: () => utils,
    accountOrders: {
      list: { useQuery: () => ({ data: orderData }) },
      setOrder: { useMutation: () => mutation },
    },
  },
}))

const { useAccountOrder } = await import('./useAccountOrder')

/** Renders the hook twice with no input change and returns both Maps. */
function positionsOverTwoRenders() {
  const seen: unknown[] = []
  function Harness() {
    seen.push(useAccountOrder().positionByAccountId)
    return null
  }
  let renderer: TestRenderer.ReactTestRenderer
  act(() => {
    renderer = TestRenderer.create(createElement(Harness))
  })
  act(() => {
    renderer!.update(createElement(Harness))
  })
  return seen
}

describe('useAccountOrder', () => {
  it('keeps positionByAccountId identity stable across renders when the order has not changed', () => {
    orderData = [{ accountId: 'checking', position: 0 }]
    const [first, second] = positionsOverTwoRenders()
    expect(second).toBe(first)
  })

  it('still reflects the saved order', () => {
    orderData = [{ accountId: 'checking', position: 3 }]
    const [positions] = positionsOverTwoRenders() as Map<string, number>[]
    expect(positions.get('checking')).toBe(3)
  })
})
