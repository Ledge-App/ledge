// Source of truth for which transfer kinds exist. The router validates against this list,
// the `kind` CHECK constraint in schema.ts repeats it, and the frontend's transfer-type
// registry (frontend/lib/transfers/registry.ts) is keyed by the inferred union so adding a
// kind here fails to compile there until a full TransferTypeDefinition exists for it.
export const TRANSFER_KINDS = ['account_transfer', 'credit_card_payment', 'refund', 'reimbursement'] as const

export type TransferKind = (typeof TRANSFER_KINDS)[number]

// The subset auto-detection may create (docs/credit-card-payment-auto-transfer.md).
// Refunds and reimbursements stay manual-only, so createMany rejects them outright.
export const AUTO_TRANSFER_KINDS = ['account_transfer', 'credit_card_payment'] as const

// Who created a transfer row: the TransferSheet ('manual') or auto-detection ('auto').
// The `source` CHECK constraint in schema.ts repeats these literals; kinds.test.ts keeps
// the two in sync.
export const TRANSFER_SOURCES = ['manual', 'auto'] as const

export type TransferSource = (typeof TRANSFER_SOURCES)[number]
