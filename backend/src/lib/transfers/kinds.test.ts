import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { AUTO_TRANSFER_KINDS, TRANSFER_KINDS, TRANSFER_SOURCES } from './kinds.js'

// schema.ts inlines the kind literals in the transfer_kind_valid CHECK because drizzle-kit
// loads that file through CJS and cannot resolve our ESM '.js' import specifiers. This test is
// what keeps the two lists from drifting: adding a kind without updating the constraint would
// let the router accept a value the database then rejects at insert time.
describe('TRANSFER_KINDS', () => {
  const schemaSource = readFileSync(fileURLToPath(new URL('../db/schema.ts', import.meta.url)), 'utf8')
  const checkClause = schemaSource.match(/transfer_kind_valid[^)]*IN \(([^)]*)\)/)?.[1]

  it('has a matching CHECK constraint in schema.ts', () => {
    expect(checkClause).toBeDefined()
    const constraintKinds = Array.from(checkClause!.matchAll(/'([^']+)'/g)).map((match) => match[1])
    expect(constraintKinds.sort()).toEqual([...TRANSFER_KINDS].sort())
  })

  it('AUTO_TRANSFER_KINDS is a strict subset: refunds/reimbursements stay manual-only', () => {
    for (const kind of AUTO_TRANSFER_KINDS) expect(TRANSFER_KINDS).toContain(kind)
    expect(AUTO_TRANSFER_KINDS).not.toContain('refund')
    expect(AUTO_TRANSFER_KINDS).not.toContain('reimbursement')
  })
})

describe('TRANSFER_SOURCES', () => {
  const schemaSource = readFileSync(fileURLToPath(new URL('../db/schema.ts', import.meta.url)), 'utf8')
  const checkClause = schemaSource.match(/transfer_source_valid[^)]*IN \(([^)]*)\)/)?.[1]

  it('has a matching CHECK constraint in schema.ts', () => {
    expect(checkClause).toBeDefined()
    const constraintSources = Array.from(checkClause!.matchAll(/'([^']+)'/g)).map((match) => match[1])
    expect(constraintSources.sort()).toEqual([...TRANSFER_SOURCES].sort())
  })
})
