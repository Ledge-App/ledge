import { api } from '@/lib/api/client'

export function useReimbursements() {
  const utils = api.useUtils()
  const reimbursements = api.reimbursements.list.useQuery()
  const createMutation = api.reimbursements.create.useMutation({ onSuccess: () => utils.reimbursements.list.invalidate() })
  const deleteMutation = api.reimbursements.delete.useMutation({ onSuccess: () => utils.reimbursements.list.invalidate() })

  return {
    data: reimbursements.data,
    isLoading: reimbursements.isLoading,
    error: reimbursements.error,
    create: createMutation.mutateAsync,
    delete: deleteMutation.mutateAsync,
  }
}
