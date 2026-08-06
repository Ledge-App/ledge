import { describe, expect, it } from 'vitest'
import * as schema from './schema.js'

describe('schema', () => {
  it('exports every table required by architecture.md', () => {
    const tableNames = [
      'plaidCredentials',
      'plaidItems',
      'categories',
      'subcategories',
      'plaidCategoryMappings',
      'vendorMappings',
      'manualTransactions',
      'transactionOverrides',
      'budgets',
      'reimbursements',
      'transfers',
    ] as const
    for (const name of tableNames) {
      expect(schema[name]).toBeDefined()
    }
  })

  it('gives categories a color and icon column', () => {
    expect(schema.categories.color).toBeDefined()
    expect(schema.categories.icon).toBeDefined()
  })

  it('gives reimbursements the four nullable linkage columns', () => {
    expect(schema.reimbursements.expensePlaidTransactionId).toBeDefined()
    expect(schema.reimbursements.expenseManualTransactionId).toBeDefined()
    expect(schema.reimbursements.incomePlaidTransactionId).toBeDefined()
    expect(schema.reimbursements.incomeManualTransactionId).toBeDefined()
  })

  it('gives transfers the four linkage columns plus a kind discriminator', () => {
    expect(schema.transfers.expensePlaidTransactionId).toBeDefined()
    expect(schema.transfers.expenseManualTransactionId).toBeDefined()
    expect(schema.transfers.incomePlaidTransactionId).toBeDefined()
    expect(schema.transfers.incomeManualTransactionId).toBeDefined()
    expect(schema.transfers.kind).toBeDefined()
  })
})
