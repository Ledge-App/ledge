import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import type { Account } from '@/types/domain'

/**
 * Which accounts get a chip beside a transaction's amount, and which chip.
 *
 * The Apple case is the one worth pinning: those accounts come from Wallet with no institution
 * logo, so under the old "logo or nothing" rule an Apple Card row showed no chip at all — the only
 * rows on screen with nothing naming the account they hit.
 */
let accountsData: Account[] = []
vi.mock('./useAccounts', () => ({ useAccounts: () => ({ data: accountsData }) }))

const { AccountMarksProvider, useAccountMarks } = await import('./useAccountMarks')

function account(overrides: Partial<Account>): Account {
  return { account_id: 'a', name: 'Account', itemId: 'item-1', institutionLogo: null, ...overrides } as Account
}

function marks(accounts: Account[]) {
  accountsData = accounts
  let result: ReturnType<typeof useAccountMarks> | null = null
  function Harness() {
    result = useAccountMarks()
    return null
  }
  act(() => {
    // Through the provider, which is now the only supported way to read this: the map is built once
    // for the tree rather than once per consumer, because the consumers are transaction ROWS.
    TestRenderer.create(createElement(AccountMarksProvider, null, createElement(Harness)))
  })
  return result!
}

describe('useAccountMarks', () => {
  it('marks an Apple account with the Apple mark, logo or not', () => {
    const result = marks([account({ account_id: 'apple-card', itemId: 'financekit' })])
    expect(result.get('apple-card')).toEqual({ kind: 'apple' })
  })

  it('marks a linked account with its institution logo', () => {
    const result = marks([account({ account_id: 'checking', institutionLogo: 'BASE64' })])
    expect(result.get('checking')).toEqual({ kind: 'logo', logo: 'BASE64' })
  })

  it('leaves out an account with nothing to show', () => {
    expect(marks([account({ account_id: 'plain' })]).has('plain')).toBe(false)
  })

  it('builds the map once however many consumers read it', () => {
    accountsData = [account({ account_id: 'checking', institutionLogo: 'BASE64' })]
    const seen: unknown[] = []
    function Consumer() {
      seen.push(useAccountMarks())
      return null
    }
    act(() => {
      TestRenderer.create(
        createElement(AccountMarksProvider, null, createElement(Consumer), createElement(Consumer)),
      )
    })
    // Same Map instance, not merely equal ones: a per-consumer map is what made a 696-row list read
    // the whole accounts stack 696 times.
    expect(seen).toHaveLength(2)
    expect(seen[1]).toBe(seen[0])
  })

  it('throws when read outside a provider, rather than silently dropping every chip', () => {
    function Bare() {
      useAccountMarks()
      return null
    }
    expect(() => {
      act(() => {
        TestRenderer.create(createElement(Bare))
      })
    }).toThrow(/AccountMarksProvider/)
  })
})
