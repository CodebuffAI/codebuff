-- One-time bootstrap for environments that were previously managed by
-- `drizzle-kit push` and are now switching to `drizzle-kit migrate`.
--
-- `drizzle-kit migrate` skips any migration whose `when` (from
-- meta/_journal.json) is <= the max `created_at` in
-- drizzle.__drizzle_migrations. Inserting a single row whose `created_at`
-- matches the last-already-applied migration's `when` tells drizzle "every
-- migration up to and including this one is already applied", so only new
-- migrations run on the next deploy.
--
-- Run this exactly once per environment (prod, staging, local dev DB that
-- was set up via push). Skip it on a fresh database — `drizzle-kit migrate`
-- will apply all migrations from scratch there.
--
-- 1776719872222 = `when` of 0044_violet_stingray in meta/_journal.json.
-- If you bootstrap a new environment after further migrations have landed,
-- update the value to the latest applied migration's `when`.

CREATE SCHEMA IF NOT EXISTS drizzle;

CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
  id SERIAL PRIMARY KEY,
  hash text NOT NULL,
  created_at bigint
);

INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
SELECT 'bootstrap-from-push', 1776719872222
WHERE NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations);
