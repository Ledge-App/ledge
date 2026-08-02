// Types inferred directly from the backend router's output shapes — no hand-maintained
// duplicate type definitions to drift out of sync. Type-only, erased at compile time
// (see types/backend.ts's note on why this is safe to import from the mobile bundle).
import type { inferRouterOutputs } from '@trpc/server'
import type { AppRouter } from './backend'

type RouterOutputs = inferRouterOutputs<AppRouter>

export type Category = RouterOutputs['categories']['list'][number]
export type Subcategory = RouterOutputs['subcategories']['list'][number]
export type VendorMapping = RouterOutputs['vendorMappings']['list'][number]
export type TransactionOverride = RouterOutputs['transactionOverrides']['list'][number]
export type ManualTransaction = RouterOutputs['manualTransactions']['list'][number]
export type Budget = RouterOutputs['budgets']['list'][number]
export type Reimbursement = RouterOutputs['reimbursements']['list'][number]
export type Account = RouterOutputs['accounts']['list'][number]
export type TransactionSyncResult = RouterOutputs['transactions']['sync']
export type PlaidTransaction = TransactionSyncResult['added'][number]
