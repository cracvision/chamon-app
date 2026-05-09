DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'claude_readonly') THEN
    CREATE ROLE claude_readonly WITH LOGIN PASSWORD 'yn4mqXtAxX6vcVz4ucy7PPk65cCzFa1L9ClVmowp' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION CONNECTION LIMIT 5;
  ELSE
    ALTER ROLE claude_readonly WITH LOGIN PASSWORD 'yn4mqXtAxX6vcVz4ucy7PPk65cCzFa1L9ClVmowp' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION CONNECTION LIMIT 5;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO claude_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO claude_readonly;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO claude_readonly;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO claude_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON SEQUENCES TO claude_readonly;

DO $$
DECLARE
  s text;
  stmt text;
  stmts text[];
BEGIN
  FOREACH s IN ARRAY ARRAY['auth','vault','storage','cron','net','extensions','graphql','graphql_public','realtime','supabase_functions','pgsodium','pgsodium_masks']
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = s) THEN
      stmts := ARRAY[
        format('REVOKE ALL ON SCHEMA %I FROM claude_readonly', s),
        format('REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM claude_readonly', s),
        format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA %I FROM claude_readonly', s),
        format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA %I FROM claude_readonly', s)
      ];
      FOREACH stmt IN ARRAY stmts LOOP
        BEGIN
          EXECUTE stmt;
        EXCEPTION WHEN insufficient_privilege OR undefined_object THEN
          NULL;
        END;
      END LOOP;
    END IF;
  END LOOP;
END $$;