import { beforeEach, describe, expect, it, vi } from 'vitest'

const dbMock = { select: vi.fn() }
vi.mock('../lib/db/client.js', () => ({ db: dbMock }))

// Captures the value the query actually filters on, so the normalisation assertion below
// fails if normalisation is removed — a row-returning mock alone would pass either way.
const eq = vi.fn((_column: unknown, value: unknown) => ({ filteredOn: value }))
vi.mock('drizzle-orm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('drizzle-orm')>()),
  eq: (column: unknown, value: unknown) => eq(column, value),
}))

function mockRows(rows: unknown[]) {
  const where = vi.fn().mockResolvedValue(rows)
  const from = vi.fn(() => ({ where }))
  dbMock.select.mockReturnValue({ from })
  return { from, where }
}

describe('devEmailRepository', () => {
  beforeEach(() => vi.clearAllMocks())

  it('allows an email present in the allowlist', async () => {
    mockRows([{ email: 'dev@example.com' }])
    const { devEmailRepository } = await import('./devEmailRepository.js')

    await expect(devEmailRepository.isAllowed('dev@example.com')).resolves.toBe(true)
  })

  it('denies an email absent from the allowlist', async () => {
    mockRows([])
    const { devEmailRepository } = await import('./devEmailRepository.js')

    await expect(devEmailRepository.isAllowed('stranger@example.com')).resolves.toBe(false)
  })

  it('denies a null email without querying', async () => {
    mockRows([{ email: 'dev@example.com' }])
    const { devEmailRepository } = await import('./devEmailRepository.js')

    await expect(devEmailRepository.isAllowed(null)).resolves.toBe(false)
    expect(dbMock.select).not.toHaveBeenCalled()
  })

  it('looks up the lowercased, trimmed email', async () => {
    const { where } = mockRows([{ email: 'dev@example.com' }])
    const { devEmailRepository } = await import('./devEmailRepository.js')

    await expect(devEmailRepository.isAllowed('  DEV@Example.COM ')).resolves.toBe(true)
    expect(where).toHaveBeenCalledWith({ filteredOn: 'dev@example.com' })
  })
})
