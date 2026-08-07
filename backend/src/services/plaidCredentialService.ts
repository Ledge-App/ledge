import { devEmailRepository } from '../repositories/devEmailRepository.js'
import { plaidCredentialRepository } from '../repositories/plaidCredentialRepository.js'
import { createPlaidClient } from '../lib/plaid/client.js'

type Environment = 'sandbox' | 'production'
type CredentialInput = { clientId: string; secret: string; environment: Environment }
type TestResult = { ok: true } | { ok: false; errorCode: string; message: string }

// Plaid access tokens are scoped to the client ID and environment that minted them, and cannot
// be migrated between either. So both are fixed at the first save: changing one would orphan
// every linked bank with no way back except re-linking. Only the secret rotates, which is safe
// because rotation happens within the same client and environment.
async function resolveAllowedEnvironments(email: string | null): Promise<Environment[]> {
  return (await devEmailRepository.isAllowed(email)) ? ['production', 'sandbox'] : ['production']
}

async function probeCredentials(input: CredentialInput): Promise<TestResult> {
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

const ENVIRONMENT_NOT_ALLOWED = {
  ok: false,
  errorCode: 'ENVIRONMENT_NOT_ALLOWED',
  message: 'This account can only use production Plaid keys.',
} as const

export const plaidCredentialService = {
  allowedEnvironments: resolveAllowedEnvironments,

  async test(userId: string, email: string | null, input: CredentialInput): Promise<TestResult> {
    const existing = await plaidCredentialRepository.getDecrypted(userId)

    // Once a row exists the stored client ID and environment win over anything the caller
    // sends, so a test always verifies the credentials a save would actually persist — and
    // the environment needs no separate check, since it is one this account already passed.
    if (existing) {
      return probeCredentials({
        clientId: existing.clientId,
        secret: input.secret,
        environment: existing.environment,
      })
    }

    // With no row yet, the environment is the caller's to propose, so it is gated exactly as
    // save() gates it. Probing writes nothing, but refusing here keeps the two endpoints
    // telling the same story rather than one accepting what the other rejects.
    const allowed = await resolveAllowedEnvironments(email)
    if (!allowed.includes(input.environment)) return ENVIRONMENT_NOT_ALLOWED

    return probeCredentials(input)
  },

  async save(userId: string, email: string | null, input: CredentialInput): Promise<TestResult> {
    const existing = await plaidCredentialRepository.getDecrypted(userId)

    if (existing) {
      // Rejected rather than silently ignored: a client sending a different value believes it is
      // changing something, and should be told plainly that it is not.
      if (input.environment !== existing.environment) {
        return {
          ok: false,
          errorCode: 'ENVIRONMENT_LOCKED',
          message: 'The Plaid environment is fixed once keys are saved and cannot be changed.',
        }
      }
      if (input.clientId !== existing.clientId) {
        return {
          ok: false,
          errorCode: 'CLIENT_ID_LOCKED',
          message: 'The Plaid client ID is fixed once keys are saved and cannot be changed.',
        }
      }
    } else {
      const allowed = await resolveAllowedEnvironments(email)
      if (!allowed.includes(input.environment)) return ENVIRONMENT_NOT_ALLOWED
    }

    const result = await probeCredentials(input)
    if (!result.ok) return result
    await plaidCredentialRepository.upsert({ userId, ...input })
    return { ok: true }
  },

  async get(userId: string) {
    return plaidCredentialRepository.getMasked(userId)
  },
}
