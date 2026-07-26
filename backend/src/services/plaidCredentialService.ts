import { plaidCredentialRepository } from '../repositories/plaidCredentialRepository.js'
import { createPlaidClient } from '../lib/plaid/client.js'

type Environment = 'sandbox' | 'development' | 'production'
type CredentialInput = { clientId: string; secret: string; environment: Environment }
type TestResult = { ok: true } | { ok: false; errorCode: string; message: string }

async function testCredentials(input: CredentialInput): Promise<TestResult> {
  const client = createPlaidClient(input.clientId, input.secret, input.environment)
  try {
    // A cheap authenticated call — fails fast on bad keys/environment mismatch without touching real data.
    await client.itemGet({ access_token: 'access-sandbox-test-connection-probe' } as never)
    return { ok: true }
  } catch (error) {
    const plaidError = (error as { response?: { data?: { error_code?: string; error_message?: string } } }).response
      ?.data
    if (plaidError?.error_code === 'INVALID_ACCESS_TOKEN') {
      // Credentials themselves were accepted; only the probe token was rejected, as expected.
      return { ok: true }
    }
    return {
      ok: false,
      errorCode: plaidError?.error_code ?? 'UNKNOWN_ERROR',
      message: plaidError?.error_message ?? 'Could not verify these keys.',
    }
  }
}

export const plaidCredentialService = {
  test: testCredentials,

  async save(userId: string, input: CredentialInput): Promise<TestResult> {
    const result = await testCredentials(input)
    if (!result.ok) return result
    await plaidCredentialRepository.upsert({ userId, ...input })
    return { ok: true }
  },

  async get(userId: string) {
    return plaidCredentialRepository.getMasked(userId)
  },
}
