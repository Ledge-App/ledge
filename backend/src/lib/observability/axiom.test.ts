import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ORIGINAL_ENV = { ...process.env }

async function importAxiom() {
  vi.resetModules()
  return await import('./axiom.js')
}

function configured() {
  process.env.AXIOM_TOKEN = 'xaat-test-token'
  process.env.AXIOM_DATASET = 'tofi-backend'
}

describe('axiom sink', () => {
  beforeEach(() => {
    delete process.env.AXIOM_TOKEN
    delete process.env.AXIOM_DATASET
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
    vi.unstubAllGlobals()
  })

  it('is a no-op when no token is configured, so local dev and tests send nothing', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { sendToAxiom, isAxiomConfigured } = await importAxiom()

    expect(isAxiomConfigured()).toBe(false)
    await sendToAxiom([{ message: 'boom' }])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('is a no-op when the token is set but the dataset is missing', async () => {
    process.env.AXIOM_TOKEN = 'xaat-test-token'
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { sendToAxiom, isAxiomConfigured } = await importAxiom()

    expect(isAxiomConfigured()).toBe(false)
    await sendToAxiom([{ message: 'boom' }])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('posts the events as a json array to the dataset ingest endpoint', async () => {
    configured()
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '' })
    vi.stubGlobal('fetch', fetchMock)
    const { sendToAxiom } = await importAxiom()

    await sendToAxiom([{ message: 'boom', code: 'INTERNAL_SERVER_ERROR' }])

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.axiom.co/v1/datasets/tofi-backend/ingest')
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer xaat-test-token',
      'Content-Type': 'application/json',
    })
    expect(JSON.parse(init.body)).toEqual([{ message: 'boom', code: 'INTERNAL_SERVER_ERROR' }])
  })

  it('sends nothing for an empty batch', async () => {
    configured()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { sendToAxiom } = await importAxiom()

    await sendToAxiom([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('never throws when the sink is down, so reporting an error cannot break the response', async () => {
    configured()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))
    const { sendToAxiom } = await importAxiom()

    // The request being answered has already failed; a broken log sink must not turn that into
    // a second, different failure.
    await expect(sendToAxiom([{ message: 'boom' }])).resolves.toBeUndefined()
  })

  it('never throws when the sink rejects the batch', async () => {
    configured()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'unauthorized' }))
    const { sendToAxiom } = await importAxiom()

    await expect(sendToAxiom([{ message: 'boom' }])).resolves.toBeUndefined()
  })

  it('bounds how long it will wait, so a hung sink cannot stall the response', async () => {
    configured()
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '' })
    vi.stubGlobal('fetch', fetchMock)
    const { sendToAxiom, AXIOM_TIMEOUT_MS } = await importAxiom()

    await sendToAxiom([{ message: 'boom' }])
    // Every rejection ships, so this ceiling lands on correctly-working responses too — an
    // unbounded fetch here would hold them open for as long as the sink felt like taking.
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
    expect(AXIOM_TIMEOUT_MS).toBeLessThanOrEqual(1000)
  })
})
