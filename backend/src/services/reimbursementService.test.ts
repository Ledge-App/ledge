import { describe, expect, it } from 'vitest'
import { reimbursementService } from './reimbursementService.js'

describe('reimbursementService.calculateNetExpense', () => {
  it('subtracts every linked reimbursement amount from the original expense', () => {
    const net = reimbursementService.calculateNetExpense('100.00', [{ amount: '30.00' }, { amount: '30.00' }])
    expect(net).toBe('40.00')
  })

  it('returns the full original amount when nothing is linked yet', () => {
    expect(reimbursementService.calculateNetExpense('100.00', [])).toBe('100.00')
  })

  it('never goes negative even if reimbursements exceed the original (data-entry edge case)', () => {
    expect(reimbursementService.calculateNetExpense('40.00', [{ amount: '50.00' }])).toBe('0.00')
  })
})
