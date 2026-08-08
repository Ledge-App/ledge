import { z } from 'zod'
import { protectedProcedure, router } from '../trpc/trpc.js'
import { transferRepository } from '../repositories/transferRepository.js'
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
    .mutation(({ ctx, input }) => transferRepository.create(ctx.jwt, ctx.userId, input)),

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
