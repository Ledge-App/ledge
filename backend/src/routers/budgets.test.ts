import { beforeEach, describe, expect, it, vi } from 'vitest'

const repoMock = { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() }
vi.mock('../repositories/budgetRepository.js', () => ({ budgetRepository: repoMock }))

const categoryId = '11111111-1111-1111-1111-111111111111'

describe('budgets router', () => {
  beforeEach(() => vi.clearAllMocks())

  it("create scopes the budget to the caller's user id", async () => {
    repoMock.create.mockResolvedValue({ id: 'b1', categoryId, amount: '200.00', period: 'monthly' })
    const { budgetsRouter } = await import('./budgets.js')
    const caller = budgetsRouter.createCaller({ userId: 'user-1', email: null, jwt: 'jwt-1' })

    await caller.create({ categoryId, amount: '200.00', period: 'monthly' })

    expect(repoMock.create).toHaveBeenCalledWith('jwt-1', 'user-1', { categoryId, amount: '200.00', period: 'monthly' })
  })

  it('spendCalculations combines each budget with its computed progress', async () => {
    repoMock.list.mockResolvedValue([{ id: 'b1', categoryId, amount: '200.00', period: 'monthly' }])
    const { budgetsRouter } = await import('./budgets.js')
    const caller = budgetsRouter.createCaller({ userId: 'user-1', email: null, jwt: 'jwt-1' })

    const result = await caller.spendCalculations({ spendByCategory: { [categoryId]: '127.40' } })

    expect(result).toEqual([
      expect.objectContaining({ id: 'b1', categoryId, amount: '200.00', status: 'on_track' }),
    ])
  })
})
