CREATE TABLE "connection_access_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"connection_id" uuid,
	"provider" text NOT NULL,
	"action" text NOT NULL,
	"actor" text NOT NULL,
	"mission_id" uuid,
	"step_id" uuid,
	"outcome" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"state" text NOT NULL,
	"encrypted_verifier" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_connections" ADD COLUMN "kind" text DEFAULT 'api_key' NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_connections" ADD COLUMN "label" text;--> statement-breakpoint
ALTER TABLE "auth_connections" ADD COLUMN "last_used_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "connection_access_log" ADD CONSTRAINT "connection_access_log_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connection_access_log" ADD CONSTRAINT "connection_access_log_connection_id_auth_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."auth_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connection_access_log" ADD CONSTRAINT "connection_access_log_mission_id_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."missions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connection_access_log" ADD CONSTRAINT "connection_access_log_step_id_mission_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."mission_steps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_states" ADD CONSTRAINT "oauth_states_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_states" ADD CONSTRAINT "oauth_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "connection_access_log_org_idx" ON "connection_access_log" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "connection_access_log_connection_idx" ON "connection_access_log" USING btree ("connection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_states_state_idx" ON "oauth_states" USING btree ("state");--> statement-breakpoint
ALTER TABLE "connection_access_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "connection_access_log";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "connection_access_log" USING (org_id = app_current_org_id()) WITH CHECK (org_id = app_current_org_id());--> statement-breakpoint
ALTER TABLE "oauth_states" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "oauth_states";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "oauth_states" USING (org_id = app_current_org_id()) WITH CHECK (org_id = app_current_org_id());
