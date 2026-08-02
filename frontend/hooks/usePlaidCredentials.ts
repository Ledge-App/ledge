import { api } from '@/lib/api/client'

export type PlaidEnvironment = 'sandbox' | 'development' | 'production'

export function usePlaidCredentials() {
  const utils = api.useUtils()
  const credentials = api.plaidCredentials.get.useQuery()
  const testMutation = api.plaidCredentials.test.useMutation()
  const saveMutation = api.plaidCredentials.save.useMutation({
    onSuccess: () => utils.plaidCredentials.get.invalidate(),
  })

  return {
    data: credentials.data,
    isLoading: credentials.isLoading,
    error: credentials.error,
    test: testMutation.mutateAsync,
    isTesting: testMutation.isLoading,
    save: saveMutation.mutateAsync,
    isSaving: saveMutation.isLoading,
  }
}
