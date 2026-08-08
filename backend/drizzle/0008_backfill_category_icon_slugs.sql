-- Backfills `categories.icon` from the emoji seeded before the SVG icon set to the slugs that
-- resolve against frontend/assets/category-icons. Rows seeded after the switch already hold slugs
-- and match nothing here, so this is safe to re-run.
--
-- Categories a user renamed still backfill: the mapping keys on the stored emoji, not the name.
-- The two exceptions are Bills & Utilities and Loans Received, which were seeded with the same
-- receipt emoji and so can only be told apart by name -- a user who renamed either one keeps the
-- emoji, which the app still renders via its legacy-emoji path.
--
-- Custom categories are deliberately untouched. Their emoji were free-typed and have no slug, so
-- rewriting them would mean picking an icon the user never chose; they keep rendering as emoji.

UPDATE "categories" SET "icon" = 'bills-and-utilities'
WHERE "icon" = '🧾' AND "name" = 'Bills & Utilities';

UPDATE "categories" SET "icon" = 'loan-received'
WHERE "icon" = '🧾' AND "name" = 'Loans Received';

UPDATE "categories" SET "icon" = v.slug
FROM (VALUES
  ('🍽', 'food-and-drink'),
  ('🚗', 'transport'),
  ('✈️', 'travel'),
  ('🎮', 'entertainment'),
  ('🛍', 'shopping'),
  ('⚕️', 'health'),
  ('💇', 'personal-care'),
  ('🏠', 'home'),
  ('🧰', 'services'),
  ('💰', 'income'),
  ('⬇️', 'transfer-in'),
  ('⬆️', 'transfer-out'),
  ('🏦', 'payments'),
  ('⚠️', 'fee'),
  ('❔', 'other')
) AS v(emoji, slug)
WHERE "categories"."icon" = v.emoji;
