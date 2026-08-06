ALTER TABLE "transfers" DROP CONSTRAINT "transfer_kind_valid";--> statement-breakpoint
DROP INDEX IF EXISTS "transfers_expense_plaid_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "transfers_expense_manual_unique";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "transfers_expense_plaid_unique" ON "transfers" USING btree ("user_id","expense_plaid_transaction_id") WHERE "transfers"."expense_plaid_transaction_id" IS NOT NULL AND "transfers"."kind" != 'reimbursement';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "transfers_expense_manual_unique" ON "transfers" USING btree ("user_id","expense_manual_transaction_id") WHERE "transfers"."expense_manual_transaction_id" IS NOT NULL AND "transfers"."kind" != 'reimbursement';--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfer_kind_valid" CHECK ("transfers"."kind" IN ('account_transfer', 'credit_card_payment', 'refund', 'reimbursement'));