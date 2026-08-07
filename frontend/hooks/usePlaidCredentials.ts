import { api } from '@/lib/api/client'

export type PlaidEnvironment = 'sandbox' | 'production'

export function usePlaidCredentials() {
  const utils = api.useUtils()
  const credentials = api.plaidCredentials.get.useQuery()
  const capabilities = api.plaidCredentials.capabilities.useQuery()
  const testMutation = api.plaidCredentials.test.useMutation()
  const saveMutation = api.plaidCredentials.save.useMutation({
    onSuccess: () => utils.plaidCredentials.get.invalidate(),
  })

  return {
    data: credentials.data,
    // Production-only until the server says otherwise, so a slow or failed capabilities
    // query can never widen the choice — the server re-checks on save regardless.
    allowedEnvironments: capabilities.data?.allowedEnvironments ?? (['production'] as PlaidEnvironment[]),
    isLoading: credentials.isLoading || capabilities.isLoading,
    error: credentials.error,
    test: testMutation.mutateAsync,
    isTesting: testMutation.isLoading,
    save: saveMutation.mutateAsync,
    isSaving: saveMutation.isLoading,
  }
}
