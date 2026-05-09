-- Allow new entity_type in events CHECK
ALTER TABLE public.events DROP CONSTRAINT events_entity_type_check;
ALTER TABLE public.events ADD CONSTRAINT events_entity_type_check
  CHECK (entity_type = ANY (ARRAY[
    'task','mission','area','attachment','contact','profile',
    'agent_action','reservation','property','vendor','asset',
    'email_ingestion','mission_template'
  ]));

-- Step 0: properties
CREATE UNIQUE INDEX IF NOT EXISTS properties_user_name_uniq
  ON public.properties(user_id, name) WHERE deleted_at IS NULL;

INSERT INTO public.properties (user_id, name, code, address, timezone, is_active, created_by)
VALUES (
  '1d71c262-7c8a-4a1f-84ef-1120f02d3321',
  'Vista Pelícano','VP','Fajardo, PR','America/Puerto_Rico',true,
  '1d71c262-7c8a-4a1f-84ef-1120f02d3321'
)
ON CONFLICT (user_id, name) WHERE deleted_at IS NULL DO NOTHING;

-- Step 1: mission_templates
CREATE TABLE IF NOT EXISTS public.mission_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  default_area_id uuid REFERENCES public.areas(id) ON DELETE SET NULL,
  default_priority text NOT NULL DEFAULT 'mid',
  default_reward_text text,
  task_offsets jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid
);

CREATE UNIQUE INDEX IF NOT EXISTS mission_templates_user_name_uniq
  ON public.mission_templates(user_id, name) WHERE deleted_at IS NULL;

ALTER TABLE public.mission_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY mission_templates_select_own ON public.mission_templates
  FOR SELECT TO authenticated USING (auth.uid() = user_id AND deleted_at IS NULL);
CREATE POLICY mission_templates_insert_own ON public.mission_templates
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY mission_templates_update_own ON public.mission_templates
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY mission_templates_delete_own ON public.mission_templates
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER mission_templates_set_user_id
  BEFORE INSERT ON public.mission_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id_on_insert();
CREATE TRIGGER mission_templates_set_updated_at
  BEFORE UPDATE ON public.mission_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER mission_templates_audit
  AFTER INSERT OR UPDATE ON public.mission_templates
  FOR EACH ROW EXECUTE FUNCTION public.audit_change();

-- Update audit_change to include the new mapping
CREATE OR REPLACE FUNCTION public.audit_change()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _action TEXT; _entity TEXT; _new_jsonb jsonb; _old_jsonb jsonb;
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
    WHEN 'mission_templates' THEN 'mission_template'
    ELSE TG_TABLE_NAME
  END;
  IF TG_OP = 'INSERT' THEN
    _action := 'created'; _new_jsonb := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    _new_jsonb := to_jsonb(NEW); _old_jsonb := to_jsonb(OLD);
    IF (_new_jsonb ? 'deleted_at') AND _new_jsonb->>'deleted_at' IS NOT NULL AND _old_jsonb->>'deleted_at' IS NULL THEN
      _action := 'deleted';
    ELSIF (_new_jsonb ? 'deleted_at') AND _new_jsonb->>'deleted_at' IS NULL AND _old_jsonb->>'deleted_at' IS NOT NULL THEN
      _action := 'restored';
    ELSIF TG_TABLE_NAME = 'tasks' AND _new_jsonb->>'status' IS DISTINCT FROM _old_jsonb->>'status' THEN
      _action := 'status_changed';
    ELSIF TG_TABLE_NAME IN ('tasks','missions','reservations') AND _new_jsonb->>'due_date' IS DISTINCT FROM _old_jsonb->>'due_date' THEN
      _action := 'due_changed';
    ELSE
      _action := 'updated';
    END IF;
  END IF;
  INSERT INTO public.events (user_id, entity_type, entity_id, action, metadata)
  VALUES (
    COALESCE((_new_jsonb->>'user_id')::uuid, (to_jsonb(OLD)->>'user_id')::uuid),
    _entity, COALESCE(NEW.id, OLD.id), _action, NULL
  );
  RETURN NEW;
END
$function$;

INSERT INTO public.mission_templates (
  user_id, name, description, default_priority, task_offsets, created_by
) VALUES (
  '1d71c262-7c8a-4a1f-84ef-1120f02d3321',
  'Nueva reserva Airbnb',
  'Plantilla estándar para preparar y cerrar una estadía en una propiedad.',
  'high',
  '[
    {"title":"Confirmar detalles de la reserva con el huésped","due_offset_days":-7,"relative_to":"check_in","friction_level":2,"is_today":false},
    {"title":"Coordinar limpieza pre-checkin","due_offset_days":-1,"relative_to":"check_in","friction_level":3,"is_today":false},
    {"title":"Revisar inventario y supplies","due_offset_days":-1,"relative_to":"check_in","friction_level":2,"is_today":false},
    {"title":"Enviar instrucciones de acceso al huésped","due_offset_days":-1,"relative_to":"check_in","friction_level":2,"is_today":false},
    {"title":"Confirmar check-in del huésped","due_offset_days":0,"relative_to":"check_in","friction_level":1,"is_today":true},
    {"title":"Coordinar limpieza post-checkout","due_offset_days":0,"relative_to":"check_out","friction_level":3,"is_today":true},
    {"title":"Solicitar review al huésped","due_offset_days":1,"relative_to":"check_out","friction_level":1,"is_today":false}
  ]'::jsonb,
  '1d71c262-7c8a-4a1f-84ef-1120f02d3321'
)
ON CONFLICT (user_id, name) WHERE deleted_at IS NULL DO NOTHING;

-- Step 2: instantiate_template
CREATE OR REPLACE FUNCTION public.instantiate_template(
  _template_id uuid, _context jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _tpl record; _mission_id uuid; _offset jsonb;
  _base_date date; _due date;
  _check_in date; _check_out date;
  _aa_id uuid; _area_id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;

  SELECT * INTO _tpl FROM public.mission_templates
  WHERE id = _template_id AND deleted_at IS NULL;

  IF NOT FOUND OR _tpl.user_id <> _uid THEN
    RAISE EXCEPTION 'not_found_or_forbidden' USING ERRCODE = '42501';
  END IF;

  IF NULLIF(_context->>'title','') IS NULL
     OR NULLIF(_context->>'check_in_date','') IS NULL
     OR NULLIF(_context->>'check_out_date','') IS NULL THEN
    RAISE EXCEPTION 'invalid_context: title, check_in_date, check_out_date required'
      USING ERRCODE = '22023';
  END IF;

  _check_in := (_context->>'check_in_date')::date;
  _check_out := (_context->>'check_out_date')::date;
  _aa_id := NULLIF(_context->>'agent_action_id','')::uuid;
  _area_id := COALESCE(NULLIF(_context->>'area_id','')::uuid, _tpl.default_area_id);

  INSERT INTO public.missions (
    user_id, area_id, title, priority, due_date, reward_text, agent_action_id
  ) VALUES (
    _uid, _area_id, _context->>'title', _tpl.default_priority,
    _check_out, _tpl.default_reward_text, _aa_id
  ) RETURNING id INTO _mission_id;

  FOR _offset IN SELECT * FROM jsonb_array_elements(_tpl.task_offsets) LOOP
    _base_date := CASE _offset->>'relative_to'
      WHEN 'check_out' THEN _check_out ELSE _check_in
    END;
    _due := _base_date + COALESCE((_offset->>'due_offset_days')::int, 0);

    INSERT INTO public.tasks (
      user_id, mission_id, title, notes, due_date,
      friction_level, effort_minutes, is_today, agent_action_id
    ) VALUES (
      _uid, _mission_id, _offset->>'title', _offset->>'notes', _due,
      COALESCE((_offset->>'friction_level')::int, 2),
      NULLIF(_offset->>'effort_minutes','')::int,
      COALESCE((_offset->>'is_today')::boolean, false),
      _aa_id
    );
  END LOOP;

  RETURN _mission_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.instantiate_template(uuid, jsonb) TO authenticated;