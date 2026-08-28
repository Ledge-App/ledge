import { describe, expect, it } from 'vitest'
import { toRequestEvent } from './requestEvent.js'

function request(url: string, method = 'GET') {
  return { method, url, id: 'req-3' }
}
function reply(statusCode: number, elapsedTime = 12.5) {
  return { statusCode, elapsedTime }
}

describe('toRequestEvent', () => {
  it('describes a completed request', () => {
    const event = toRequestEvent(request('/trpc/accounts.list'), reply(200)) as Record<string, unknown>

    expect(event._time).toEqual(expect.any(String))
    expect(event.level).toBe('info')
    expect(event.service).toBe('tofi-backend')
    expect(event.requestId).toBe('req-3')
    expect(event.http).toEqual({ method: 'GET', path: '/trpc/accounts.list', statusCode: 200, durationMs: 12.5 })
  })

  it('strips the query string, which is where a batched query carries its input', () => {
    // A batched GET puts the procedure input in the URL — cursors among them. Logging the raw
    // url would persist exactly what the error path is careful never to send.
    const url = '/trpc/transactions.sync?batch=1&input=%7B%220%22%3A%7B%22cursors%22%3A%7B%22item-1%22%3A%22SECRET%22%7D%7D%7D'
    const event = toRequestEvent(request(url), reply(200)) as { http: { path: string } }

    expect(event.http.path).toBe('/trpc/transactions.sync')
    expect(JSON.stringify(event)).not.toContain('SECRET')
    expect(JSON.stringify(event)).not.toContain('cursors')
  })

  it('keeps the full batched procedure list, which is the useful part of the path', () => {
    const event = toRequestEvent(request('/trpc/accounts.list,categories.list?batch=1'), reply(200)) as {
      http: { path: string }
    }
    expect(event.http.path).toBe('/trpc/accounts.list,categories.list')
  })

  it('marks a failed response as a warning so it is separable from healthy traffic', () => {
    expect((toRequestEvent(request('/trpc/x'), reply(500)) as { level: string }).level).toBe('warn')
    expect((toRequestEvent(request('/trpc/x'), reply(401)) as { level: string }).level).toBe('warn')
    expect((toRequestEvent(request('/trpc/x'), reply(207)) as { level: string }).level).toBe('info')
  })

  it('rounds the duration, since sub-microsecond precision is noise', () => {
    const event = toRequestEvent(request('/health'), reply(200, 3.14159)) as { http: { durationMs: number } }
    expect(event.http.durationMs).toBe(3.14)
  })
})
