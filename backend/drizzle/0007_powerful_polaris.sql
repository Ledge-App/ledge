-- Drops the original `reimbursements` table. Reimbursements have been rows in `transfers` with
-- kind = 'reimbursement' since 0003; this table has had no writer since, and the app now reads
-- links from `transfers` alone.
--
-- Guarded rather than a bare DROP: if some database still holds rows, they are the only copy —
-- Plaid transactions live in on-device storage, so a dropped link cannot be reconstructed. This
-- fails the migration loudly instead of deleting them. To migrate them first:
--
--   INSERT INTO transfers (user_id, kind, expense_plaid_transaction_id,
--     expense_manual_transaction_id, income_plaid_transaction_id, income_manual_transaction_id,
--     amount, note, created_at)
--   SELECT user_id, 'reimbursement', expense_plaid_transaction_id,
--     expense_manual_transaction_id, income_plaid_transaction_id, income_manual_transaction_id,
--     amount, note, created_at
--   FROM reimbursements
--   ON CONFLICT DO NOTHING;
DO $$
DECLARE
  remaining bigint;
BEGIN
  IF to_regclass('public.reimbursements') IS NULL THEN
    RAISE NOTICE 'reimbursements already gone; nothing to drop';
    RETURN;
  END IF;

  EXECUTE 'SELECT count(*) FROM public.reimbursements' INTO remaining;
  IF remaining > 0 THEN
    RAISE EXCEPTION 'reimbursements still holds % row(s); migrate them into transfers before dropping', remaining;
  END IF;

  -- CASCADE clears the table's RLS policy and FK constraints along with it.
  DROP TABLE public.reimbursements CASCADE;
END $$;
