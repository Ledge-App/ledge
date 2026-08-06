CREATE TABLE IF NOT EXISTS "transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"expense_plaid_transaction_id" text,
	"expense_manual_transaction_id" uuid,
	"income_plaid_transaction_id" text,
	"income_manual_transaction_id" uuid,
	"amount" numeric(12, 2) NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transfer_expense_xor" CHECK (("transfers"."expense_plaid_transaction_id" IS NOT NULL) <> ("transfers"."expense_manual_transaction_id" IS NOT NULL)),
	CONSTRAINT "transfer_income_not_both" CHECK (NOT ("transfers"."income_plaid_transaction_id" IS NOT NULL AND "transfers"."income_manual_transaction_id" IS NOT NULL)),
	CONSTRAINT "transfer_kind_valid" CHECK ("transfers"."kind" IN ('account_transfer', 'credit_card_payment'))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transfers" ADD CONSTRAINT "transfers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transfers" ADD CONSTRAINT "transfers_expense_manual_transaction_id_manual_transactions_id_fk" FOREIGN KEY ("expense_manual_transaction_id") REFERENCES "public"."manual_transactions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transfers" ADD CONSTRAINT "transfers_income_manual_transaction_id_manual_transactions_id_fk" FOREIGN KEY ("income_manual_transaction_id") REFERENCES "public"."manual_transactions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "transfers_expense_plaid_unique" ON "transfers" USING btree ("user_id","expense_plaid_transaction_id") WHERE "transfers"."expense_plaid_transaction_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "transfers_expense_manual_unique" ON "transfers" USING btree ("user_id","expense_manual_transaction_id") WHERE "transfers"."expense_manual_transaction_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "transfers_income_plaid_unique" ON "transfers" USING btree ("user_id","income_plaid_transaction_id") WHERE "transfers"."income_plaid_transaction_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "transfers_income_manual_unique" ON "transfers" USING btree ("user_id","income_manual_transaction_id") WHERE "transfers"."income_manual_transaction_id" IS NOT NULL;--> statement-breakpoint
-- The blanket policy loop in 0001 only covers tables that existed when it ran, so `transfers`
-- needs its own. Same shape: RLS on, one FOR ALL owner policy scoped to auth.uid().
ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "transfers_owner" ON public.transfers;--> statement-breakpoint
CREATE POLICY "transfers_owner" ON public.transfers FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
