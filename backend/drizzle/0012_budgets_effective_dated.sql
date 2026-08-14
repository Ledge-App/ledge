ALTER TABLE "budgets" ALTER COLUMN "amount" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "budgets" ALTER COLUMN "period" SET DEFAULT 'monthly';--> statement-breakpoint
ALTER TABLE "budgets" ADD COLUMN "effective_month" date DEFAULT date_trunc('month', now())::date NOT NULL;--> statement-breakpoint
ALTER TABLE "budgets" ADD COLUMN "alert_threshold" integer;--> statement-breakpoint
-- Normalize legacy periods to their monthly equivalent, then retire the distinction: budgets
-- are monthly from here on. Weekly ~= 52 weeks / 12 months; yearly = /12.
UPDATE "budgets" SET "amount" = round("amount" * 52.0 / 12, 2), "period" = 'monthly' WHERE "period" = 'weekly';--> statement-breakpoint
UPDATE "budgets" SET "amount" = round("amount" / 12.0, 2), "period" = 'monthly' WHERE "period" = 'yearly';--> statement-breakpoint
-- Existing rows take effect from the month they were created, not the month this migration runs.
UPDATE "budgets" SET "effective_month" = date_trunc('month', "created_at")::date;--> statement-breakpoint
-- The old schema allowed duplicate budgets per category; keep the newest per (user, category, month).
DELETE FROM "budgets" b USING "budgets" b2
  WHERE b."user_id" = b2."user_id" AND b."category_id" = b2."category_id"
    AND b."effective_month" = b2."effective_month"
    AND (b."created_at" < b2."created_at" OR (b."created_at" = b2."created_at" AND b."id" < b2."id"));--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_user_id_category_id_effective_month_unique" UNIQUE("user_id","category_id","effective_month");
