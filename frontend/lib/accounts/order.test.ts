import { describe, expect, it } from 'vitest'
import { applyGroupOrder, moveItem, sortAccountsByPreference, targetForOffset } from './order'


const acct = (id: string) => ({ account_id: id })

describe('sortAccountsByPreference', () => {
  it('orders by saved position', () => {
    const map = new Map([['c', 0], ['a', 1], ['b', 2]])
    expect(sortAccountsByPreference([acct('a'), acct('b'), acct('c')], map).map((a) => a.account_id))
      .toEqual(['c', 'a', 'b'])
  })

  // A newly linked account must appear predictably at the bottom, never in the middle of a
  // list the user arranged.
  it('sinks unpositioned accounts below every positioned one, in arrival order', () => {
    const map = new Map([['b', 0]])
    expect(sortAccountsByPreference([acct('a'), acct('b'), acct('c')], map).map((a) => a.account_id))
      .toEqual(['b', 'a', 'c'])
  })

  it('leaves order untouched when nothing is positioned', () => {
    expect(sortAccountsByPreference([acct('a'), acct('b')], new Map()).map((a) => a.account_id))
      .toEqual(['a', 'b'])
  })

  it('does not mutate the input array', () => {
    const input = [acct('a'), acct('b')]
    sortAccountsByPreference(input, new Map([['b', 0]]))
    expect(input.map((a) => a.account_id)).toEqual(['a', 'b'])
  })
})

describe('moveItem', () => {
  it('moves an item down and shifts the rest up', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd'])
  })

  it('moves an item up', () => {
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
  })

  it('clamps an overshoot past the end rather than dropping the item', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 99)).toEqual(['b', 'c', 'a'])
  })

  it('returns the same list when nothing moves', () => {
    expect(moveItem(['a', 'b'], 1, 1)).toEqual(['a', 'b'])
  })
})

describe('applyGroupOrder', () => {
  // A reorder concerns ONE group; the other groups' positions must survive it.
  it('repositions only the named accounts', () => {
    const result = applyGroupOrder([{ accountId: 'x', position: 5 }, { accountId: 'a', position: 0 }], ['b', 'a'])
    expect(result).toContainEqual({ accountId: 'x', position: 5 })
    expect(result).toContainEqual({ accountId: 'b', position: 0 })
    expect(result).toContainEqual({ accountId: 'a', position: 1 })
    expect(result).toHaveLength(3)
  })
})

describe('targetForOffset', () => {
  const uniform = [60, 60, 60, 60]

  it('stays put until the drag passes the next row midpoint', () => {
    expect(targetForOffset(uniform, 0, 0)).toBe(0)
    expect(targetForOffset(uniform, 0, 29)).toBe(0)
    expect(targetForOffset(uniform, 0, 31)).toBe(1)
  })

  it('crosses a second row once past its midpoint too', () => {
    expect(targetForOffset(uniform, 0, 91)).toBe(2)
  })

  it('travels upward symmetrically', () => {
    expect(targetForOffset(uniform, 3, -31)).toBe(2)
    expect(targetForOffset(uniform, 3, -91)).toBe(1)
  })

  it('clamps at the ends instead of running past them', () => {
    expect(targetForOffset(uniform, 0, 10_000)).toBe(3)
    expect(targetForOffset(uniform, 3, -10_000)).toBe(0)
  })

  // The reason this walks real heights instead of dividing by one nominal row height.
  it('honours a taller neighbour rather than assuming uniform rows', () => {
    const varied = [60, 200, 60]
    // 60px is well past a 60px row's midpoint, but nowhere near the 200px row's.
    expect(targetForOffset(varied, 0, 60)).toBe(0)
    expect(targetForOffset(varied, 0, 101)).toBe(1)
  })
})
