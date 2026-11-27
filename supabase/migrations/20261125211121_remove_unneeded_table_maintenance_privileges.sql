-- RECOVERED EXACTLY from Supabase migration ledger.
-- Source project: qejfhjpopsgaeuqygihr
-- Version: 20261125211121
-- Name: remove_unneeded_table_maintenance_privileges
-- This file records an already-applied migration; do not replay on the live project.

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
