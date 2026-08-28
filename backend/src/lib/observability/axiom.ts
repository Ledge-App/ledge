/**
 * Ships error events to Axiom.
 *
 * Vercel's Hobby plan keeps runtime logs for about an hour, live-tail only, and gates Log Drains
 * behind Pro — so the platform cannot be the place these are collected. That leaves pushing from
 * inside the invocation, which is what this does. The pino stdout line stays as the live-tail
 * view; this is the durable copy.
 *
 * Two rules follow from running on the error path of a request that has already failed:
 * it must never throw, and it must never wait indefinitely.
 */
const INGEST_HOST = 'https://api.axiom.co'

/**
 * Bounded because the caller is holding a response open waiting for this (see the onSend hook in
 * server.ts). Every rejection ships, including the expected ones, so this ceiling now applies to
 * responses that are working correctly — a 401 during an ordinary token refresh among them.
 * A typical ingest is well inside it; this only caps the case where Axiom is unwell.
 */
export const AXIOM_TIMEOUT_MS = 1_000

function config(): { token: string; dataset: string } | null {
  const token = process.env.AXIOM_TOKEN
  const dataset = process.env.AXIOM_DATASET
  // Read per call rather than at module load: the module is imported once per serverless
  // instance, and tests configure the environment after importing.
  if (!token || !dataset) return null
  return { token, dataset }
}

/** False in local development and in tests unless both variables are set — the sink is opt-in. */
export function isAxiomConfigured(): boolean {
  return config() !== null
}

export async function sendToAxiom(events: object[]): Promise<void> {
  if (events.length === 0) return
  const settings = config()
  if (!settings) return

  try {
    const response = await fetch(`${INGEST_HOST}/v1/datasets/${settings.dataset}/ingest`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(events),
      signal: AbortSignal.timeout(AXIOM_TIMEOUT_MS),
    })
    if (!response.ok) {
      // Deliberately console, not the request logger: this runs during onSend, and a failure
      // here means the durable sink is unavailable, so stdout is the only place left.
      console.error(`[axiom] ingest rejected with ${response.status}: ${await response.text()}`)
    }
  } catch (err) {
    // A dead or slow sink must not convert one failed request into a different failed request.
    console.error(`[axiom] ingest failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}
