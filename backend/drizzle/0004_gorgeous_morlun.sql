CREATE TABLE IF NOT EXISTS "dev_emails" (
	"email" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dev_emails_lowercase" CHECK ("dev_emails"."email" = lower("dev_emails"."email"))
);
--> statement-breakpoint
-- RLS with no policy at all: this table is not user-scoped, so unlike the tables in
-- migration 0001 there is no `auth.uid() = user_id` predicate that would make sense here.
-- Deny-by-default is the intent — the only reader is the backend, over the service-role
-- connection that holds BYPASSRLS. Without this, the default grants would let any signed-in
-- user enumerate the developers' email addresses.
ALTER TABLE "dev_emails" ENABLE ROW LEVEL SECURITY;
