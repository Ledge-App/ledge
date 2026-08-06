import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { TRANSFER_KINDS } from './kinds.js'

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
})
