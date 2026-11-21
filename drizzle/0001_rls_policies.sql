-- Row-level security: defence in depth behind application-level tenant scoping.
-- The application sets `app.current_org_id` per transaction via
-- `SELECT set_config('app.current_org_id', '<uuid>', true)`.
-- Superusers and table owners bypass RLS, so production must connect as a
-- dedicated non-owner role (`decupo_app`). See docs/ARCHITECTURE.md.
CREATE OR REPLACE FUNCTION app_current_org_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_org_id', true), '')::uuid
$$;
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'workspaces','memberships','missions','mission_steps','mission_events',
    'approvals','artifacts','credit_ledger','provider_costs','jobs',
    'tool_invocations','auth_connections','notifications'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (org_id = app_current_org_id()) WITH CHECK (org_id = app_current_org_id())',
      t);
  END LOOP;
END $$;
--> statement-breakpoint
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON organizations;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON organizations USING (id = app_current_org_id());
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'decupo_app') THEN
    CREATE ROLE decupo_app NOLOGIN;
  END IF;
END $$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO decupo_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO decupo_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO decupo_app;
