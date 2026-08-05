-- Enable Row-Level Security on every user-scoped table.
--
-- docs/architecture.md ("Auth Model: JWT verification + RLS as defense-in-depth")
-- specifies that RLS is enabled on every table with `auth.uid() = user_id`, and the
-- Supabase-backed repositories rely on it: they issue queries through a per-request
-- client authenticated with the caller's JWT and carry no `user_id` predicate of their
-- own. Migration 0000 created the tables but never enabled RLS or defined policies, so
-- the default grants to the `authenticated` role went unfiltered and every signed-in
-- user could read, update, and delete every other user's rows.
--
-- One FOR ALL policy per table covers SELECT/INSERT/UPDATE/DELETE. USING filters the
-- rows a statement can see or modify; WITH CHECK rejects inserts and updates that would
-- write a row owned by someone else.
--
-- plaid_items and plaid_credentials are included deliberately. The two privileged
-- decryption paths reach them over a service-role connection, and service_role holds
-- BYPASSRLS, so those code paths are unaffected while a stray user-scoped query against
-- either table stays fenced in.
--
-- DROP POLICY IF EXISTS keeps this re-runnable and lets it apply cleanly to a database
-- where some policies were already added by hand. Note that it only drops the
-- `<table>_owner` policy this migration manages: policies are permissive and OR together,
-- so if a table already carries a differently-named policy, verify it after migrating
-- with `select tablename, policyname, qual from pg_policies where schemaname = 'public';`
--
-- `manual_accounts` is in this list but not in `schema.ts` or any migration: it exists in
-- the deployed database only. Leaving it out would leave it the one unprotected
-- user-scoped table, so it is covered here and the loop skips any table that is absent
-- rather than failing — which also keeps this migration runnable against a database built
-- from 0000 alone, where `manual_accounts` does not exist.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'manual_transactions',
    'manual_accounts',
    'categories',
    'subcategories',
    'budgets',
    'reimbursements',
    'transaction_overrides',
    'vendor_mappings',
    'plaid_category_mappings',
    'plaid_items',
    'plaid_credentials'
  ]
  LOOP
    IF to_regclass('public.' || quote_ident(t)) IS NULL THEN
      RAISE NOTICE 'skipping %: table not present in this database', t;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_owner', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)',
      t || '_owner',
      t
    );
  END LOOP;
END $$;
