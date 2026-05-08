CREATE OR REPLACE FUNCTION public.audit_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _action TEXT;
  _entity TEXT;
  _new_jsonb jsonb;
  _old_jsonb jsonb;
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

  IF TG_OP = 'INSERT' THEN
    _action := 'created';
    _new_jsonb := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    _new_jsonb := to_jsonb(NEW);
    _old_jsonb := to_jsonb(OLD);

    IF (_new_jsonb ? 'deleted_at')
       AND _new_jsonb->>'deleted_at' IS NOT NULL
       AND _old_jsonb->>'deleted_at' IS NULL THEN
      _action := 'deleted';
    ELSIF (_new_jsonb ? 'deleted_at')
       AND _new_jsonb->>'deleted_at' IS NULL
       AND _old_jsonb->>'deleted_at' IS NOT NULL THEN
      _action := 'restored';
    ELSIF TG_TABLE_NAME = 'tasks'
       AND _new_jsonb->>'status' IS DISTINCT FROM _old_jsonb->>'status' THEN
      _action := 'status_changed';
    ELSIF TG_TABLE_NAME IN ('tasks','missions','reservations')
       AND _new_jsonb->>'due_date' IS DISTINCT FROM _old_jsonb->>'due_date' THEN
      _action := 'due_changed';
    ELSE
      _action := 'updated';
    END IF;
  END IF;

  INSERT INTO public.events (user_id, entity_type, entity_id, action, metadata)
  VALUES (
    COALESCE((_new_jsonb->>'user_id')::uuid, (to_jsonb(OLD)->>'user_id')::uuid),
    _entity,
    COALESCE(NEW.id, OLD.id),
    _action,
    NULL
  );
  RETURN NEW;
END
$function$;