CREATE TABLE IF NOT EXISTS "transfer_dismissals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"expense_plaid_transaction_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transfers" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transfer_dismissals" ADD CONSTRAINT "transfer_dismissals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "transfer_dismissals_unique" ON "transfer_dismissals" USING btree ("user_id","expense_plaid_transaction_id");--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfer_source_valid" CHECK ("transfers"."source" IN ('manual', 'auto'));--> statement-breakpoint
-- The blanket policy loop in 0001 only covers tables that existed when it ran, so
-- `transfer_dismissals` needs its own. Same shape as transfers in 0002: RLS on, one
-- FOR ALL owner policy scoped to auth.uid().
ALTER TABLE public.transfer_dismissals ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "transfer_dismissals_owner" ON public.transfer_dismissals;--> statement-breakpoint
CREATE POLICY "transfer_dismissals_owner" ON public.transfer_dismissals FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);