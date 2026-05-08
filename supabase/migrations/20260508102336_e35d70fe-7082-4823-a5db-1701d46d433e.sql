-- Fix: add standard audit columns to new Phase 1 tables so set_user_id_on_insert
-- and set_updated_at triggers stop failing with "record NEW has no field created_by".

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['properties','reservations','agent_actions','email_ingestion_log','vendors','assets']
  LOOP
    EXECUTE format('ALTER TABLE public.%I
      ADD COLUMN IF NOT EXISTS created_by uuid,
      ADD COLUMN IF NOT EXISTS updated_by uuid,
      ADD COLUMN IF NOT EXISTS deleted_by uuid,
      ADD COLUMN IF NOT EXISTS deleted_at timestamptz', t);
    EXECUTE format('UPDATE public.%I SET created_by = user_id WHERE created_by IS NULL', t);
  END LOOP;
END $$;

-- Make sure email_ingestion_log also has set_updated_at (it was missing).
DROP TRIGGER IF EXISTS email_ingestion_set_updated_at ON public.email_ingestion_log;
CREATE TRIGGER email_ingestion_set_updated_at BEFORE UPDATE ON public.email_ingestion_log
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- email_ingestion_log doesn't have updated_at column — add it for consistency.
ALTER TABLE public.email_ingestion_log
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Extend audit_change() to handle the new entity types.
CREATE OR REPLACE FUNCTION public.audit_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _action TEXT; _entity TEXT;
BEGIN
  _entity := CASE TG_TABLE_NAME
    WHEN 'missions' THEN 'mission'
    WHEN 'tasks' THEN 'task'
    WHEN 'properties' THEN 'property'
    WHEN 'reservations' THEN 'reservation'
    WHEN 'agent_actions' THEN 'agent_action'
    WHEN 'email_ingestion_log' THEN 'email_ingestion'
    WHEN 'vendors' THEN 'vendor'
    WHEN 'assets' THEN 'asset'
    ELSE TG_TABLE_NAME
  END;

  IF TG_OP = 'INSERT' THEN _action := 'created';
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN _action := 'deleted';
    ELSIF NEW.deleted_at IS NULL AND OLD.deleted_at IS NOT NULL THEN _action := 'restored';
    ELSIF (TG_TABLE_NAME='tasks' AND NEW.status IS DISTINCT FROM OLD.status) THEN _action := 'status_changed';
    ELSIF (TG_TABLE_NAME IN ('tasks','missions','reservations') AND NEW.due_date IS DISTINCT FROM OLD.due_date) THEN _action := 'due_changed';
    ELSE _action := 'updated';
    END IF;
  END IF;

  INSERT INTO public.events (user_id, entity_type, entity_id, action, metadata)
  VALUES (COALESCE(NEW.user_id, OLD.user_id), _entity, NEW.id, _action, NULL);
  RETURN NEW;
END $function$;

-- Attach audit trigger to the 6 new tables.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['properties','reservations','agent_actions','email_ingestion_log','vendors','assets']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_audit ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_audit AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_change()', t, t);
  END LOOP;
END $$;

-- Tighten SELECT policies to respect soft-delete (deleted_at IS NULL).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['properties','reservations','agent_actions','email_ingestion_log','vendors','assets']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select_own', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (auth.uid() = user_id AND deleted_at IS NULL)',
      t || '_select_own', t);
  END LOOP;
END $$;