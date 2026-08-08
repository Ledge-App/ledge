ALTER TABLE "categories" ADD COLUMN "is_default" boolean DEFAULT false NOT NULL;--> statement-breakpoint

-- Safety net for drizzle/0008, which disambiguated the two categories seeded with the same receipt
-- emoji by name, and so skipped any row whose name a user had changed. This pass uses the Plaid
-- primary each category owns instead, which no rename affects. Expected to touch zero rows.

UPDATE "categories" SET "icon" = 'bills-and-utilities'
WHERE "icon" = '🧾' AND EXISTS (
  SELECT 1 FROM "plaid_category_mappings" m
  WHERE m."category_id" = "categories"."id" AND m."plaid_pfc_primary" = 'RENT_AND_UTILITIES'
);--> statement-breakpoint

UPDATE "categories" SET "icon" = 'loan-received'
WHERE "icon" = '🧾' AND EXISTS (
  SELECT 1 FROM "plaid_category_mappings" m
  WHERE m."category_id" = "categories"."id" AND m."plaid_pfc_primary" = 'LOAN_DISBURSEMENTS'
);--> statement-breakpoint

-- Flags the rows seeded from DEFAULT_PFC_MAPPING. Matching on name AND icon together is exact
-- here: nobody has renamed a default, and 0008 already rewrote every default's icon to its slug,
-- while custom categories still carry the free-typed emoji the old text field produced.
UPDATE "categories" SET "is_default" = true
WHERE ("name", "icon") IN (
  ('Food & Drink', 'food-and-drink'),
  ('Transport', 'transport'),
  ('Travel', 'travel'),
  ('Entertainment', 'entertainment'),
  ('Shopping', 'shopping'),
  ('Bills & Utilities', 'bills-and-utilities'),
  ('Health', 'health'),
  ('Personal Care', 'personal-care'),
  ('Home', 'home'),
  ('Services', 'services'),
  ('Income', 'income'),
  ('Transfers In', 'transfer-in'),
  ('Transfers Out', 'transfer-out'),
  ('Payments', 'payments'),
  ('Loans Received', 'loan-received'),
  ('Fees', 'fee'),
  ('Other', 'other')
);
