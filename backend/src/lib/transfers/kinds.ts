// Source of truth for which transfer kinds exist. The router validates against this list,
// the `kind` CHECK constraint in schema.ts repeats it, and the frontend's transfer-type
// registry (frontend/lib/transfers/registry.ts) is keyed by the inferred union so adding a
// kind here fails to compile there until a full TransferTypeDefinition exists for it.
export const TRANSFER_KINDS = ['account_transfer', 'credit_card_payment'] as const

export type TransferKind = (typeof TRANSFER_KINDS)[number]
