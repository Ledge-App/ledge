import { z } from 'zod'
import { protectedProcedure, router } from '../trpc/trpc.js'
import { transferRepository } from '../repositories/transferRepository.js'
import { assertOwnedRefs } from '../lib/ownership/assertOwnedRefs.js'
import { AUTO_TRANSFER_KINDS, TRANSFER_KINDS } from '../lib/transfers/kinds.js'

const transferInputSchema = z.object({
  kind: z.enum(TRANSFER_KINDS),
  expensePlaidTransactionId: z.string().nullable(),
  expenseManualTransactionId: z.string().uuid().nullable(),
  // Both nullable: an unpaired transfer has no income leg.
  incomePlaidTransactionId: z.string().nullable(),
  incomeManualTransactionId: z.string().uuid().nullable(),
  amount: z.string(),
  note: z.string().nullable(),
}).superRefine((input, ctx) => {
  // A transfer with no leg at all references nothing, so it can never be found, undone or
  // applied to a total — it is an invisible orphan row. One leg is legitimate (that's how an
  // item whose counterpart isn't in the feed gets excluded); zero never is, and the only way to
  // send zero is a client bug, which is exactly the class of bug that produced this check (a
  // leg whose source wasn't mapped to any column silently nulled all four).
  const hasLeg =
    input.expensePlaidTransactionId !== null ||
    input.expenseManualTransactionId !== null ||
    input.incomePlaidTransactionId !== null ||
    input.incomeManualTransactionId !== null
  if (!hasLeg) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'A transfer must reference at least one transaction leg' })
  }
})

// Auto-detected transfers are strictly narrower than manual ones: only the two auto kinds,
// always Plaid legs, always PAIRED (detection never excludes a lone transaction). The shape
// itself enforces the design's safety rules — a client bug can't create an unpaired or
// manual-leg 'auto' transfer.
const autoTransferInputSchema = z.object({
  kind: z.enum(AUTO_TRANSFER_KINDS),
  expensePlaidTransactionId: z.string().min(1),
  incomePlaidTransactionId: z.string().min(1),
  amount: z.string(),
})

export const transfersRouter = router({
  list: protectedProcedure.query(({ ctx }) => transferRepository.list(ctx.jwt)),

  create: protectedProcedure
    .input(transferInputSchema)
    .mutation(async ({ ctx, input }) => {
      // Plaid legs are free-form ids with no FK; only the manual legs reference a table
      // where a foreign row could be attached (and cascade-deleted from under us).
      await assertOwnedRefs(ctx.jwt, {
        manualTransactionIds: [input.expenseManualTransactionId, input.incomeManualTransactionId],
      })
      return transferRepository.create(ctx.jwt, ctx.userId, input)
    }),

  // Bulk endpoint for auto-apply: one round-trip from the phone for a whole backfill.
  // Conflicts (a leg already in a transfer — e.g. a multi-device race) are skipped
  // server-side, never errors; see transferRepository.createMany.
  createMany: protectedProcedure
    .input(z.object({ transfers: z.array(autoTransferInputSchema).min(1).max(100) }))
    .mutation(({ ctx, input }) => transferRepository.createMany(ctx.jwt, ctx.userId, input.transfers)),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ ctx, input }) => transferRepository.delete(ctx.jwt, input.id)),
})
