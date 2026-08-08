import { router } from './trpc.js'
import { plaidCredentialsRouter } from '../routers/plaidCredentials.js'
import { plaidLinkRouter } from '../routers/plaidLink.js'
import { transactionsRouter } from '../routers/transactions.js'
import { accountsRouter } from '../routers/accounts.js'
import { categoriesRouter } from '../routers/categories.js'
import { subcategoriesRouter } from '../routers/subcategories.js'
import { plaidCategoryMappingsRouter } from '../routers/plaidCategoryMappings.js'
import { vendorMappingsRouter } from '../routers/vendorMappings.js'
import { manualTransactionsRouter } from '../routers/manualTransactions.js'
import { transactionOverridesRouter } from '../routers/transactionOverrides.js'
import { budgetsRouter } from '../routers/budgets.js'
import { reimbursementsRouter } from '../routers/reimbursements.js'
import { transfersRouter } from '../routers/transfers.js'
import { transferDismissalsRouter } from '../routers/transferDismissals.js'
import { investmentsRouter } from '../routers/investments.js'
import { onboardingRouter } from '../routers/onboarding.js'

export const appRouter = router({
  plaidCredentials: plaidCredentialsRouter,
  plaidLink: plaidLinkRouter,
  transactions: transactionsRouter,
  accounts: accountsRouter,
  categories: categoriesRouter,
  subcategories: subcategoriesRouter,
  plaidCategoryMappings: plaidCategoryMappingsRouter,
  vendorMappings: vendorMappingsRouter,
  manualTransactions: manualTransactionsRouter,
  transactionOverrides: transactionOverridesRouter,
  budgets: budgetsRouter,
  reimbursements: reimbursementsRouter,
  transfers: transfersRouter,
  transferDismissals: transferDismissalsRouter,
  investments: investmentsRouter,
  onboarding: onboardingRouter,
})

export type AppRouter = typeof appRouter
