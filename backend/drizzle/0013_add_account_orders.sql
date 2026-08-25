CREATE TABLE IF NOT EXISTS "account_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "account_orders" ADD CONSTRAINT "account_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "account_orders_unique" ON "account_orders" USING btree ("user_id","account_id");--> statement-breakpoint
-- The blanket policy loop in 0001 only covers tables that existed when it ran, so
-- `account_orders` needs its own. Same shape: RLS on, one FOR ALL owner policy on auth.uid().
ALTER TABLE public.account_orders ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "account_orders_owner" ON public.account_orders;--> statement-breakpoint
CREATE POLICY "account_orders_owner" ON public.account_orders FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
