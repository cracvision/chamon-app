CREATE OR REPLACE FUNCTION public.instantiate_template(_template_id uuid, _context jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _tpl record; _mission_id uuid; _offset jsonb;
  _base_date date; _due date;
  _check_in date; _check_out date;
  _aa_id uuid; _area_id uuid;
  _anchor text; _offset_days int;
  _property_id uuid;
  _reservation_confirmation text;
  _task_id uuid; _task_title text;
  _vendor record;
  _service_type text;
  _service_date date;
  _scheduled_for timestamptz;
  _aa_payload jsonb;
  _aa_idem text;
  _new_aa_id uuid;
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
  _property_id := NULLIF(_context->>'property_id','')::uuid;
  _reservation_confirmation := NULLIF(_context->>'confirmation_code','');

  INSERT INTO public.missions (
    user_id, area_id, title, priority, due_date, reward_text, agent_action_id
  ) VALUES (
    _uid, _area_id, _context->>'title', _tpl.default_priority,
    _check_out, _tpl.default_reward_text, _aa_id
  ) RETURNING id INTO _mission_id;

  IF _property_id IS NOT NULL THEN
    SELECT pva.contact_id, c.name, c.email, c.whatsapp_phone, c.preferred_channel
      INTO _vendor
    FROM public.property_vendor_assignments pva
    JOIN public.contacts c ON c.id = pva.contact_id AND c.deleted_at IS NULL
    WHERE pva.property_id = _property_id
      AND pva.vendor_category = 'vendor_cleaning'
      AND pva.is_primary = true
      AND pva.deleted_at IS NULL
      AND pva.user_id = _uid
    LIMIT 1;
  END IF;

  FOR _offset IN SELECT * FROM jsonb_array_elements(_tpl.task_offsets) LOOP
    _anchor := COALESCE(_offset->>'relative_to', 'check_in');
    _offset_days := COALESCE((_offset->>'due_offset_days')::int, 0);
    _base_date := CASE _anchor WHEN 'check_out' THEN _check_out ELSE _check_in END;
    _due := _base_date + _offset_days;
    _task_title := _offset->>'title';

    INSERT INTO public.tasks (
      user_id, mission_id, title, notes, due_date,
      friction_level, effort_minutes, is_today, agent_action_id,
      template_task_offset_days, template_task_offset_anchor
    ) VALUES (
      _uid, _mission_id, _task_title, _offset->>'notes', _due,
      COALESCE((_offset->>'friction_level')::int, 2),
      NULLIF(_offset->>'effort_minutes','')::int,
      COALESCE((_offset->>'is_today')::boolean, false),
      _aa_id, _offset_days, _anchor
    ) RETURNING id INTO _task_id;

    IF _task_title LIKE 'Coordinar limpieza pre-checkin%' THEN
      _service_type := 'pre_checkin';
      _service_date := _check_in - 1;
      _scheduled_for := ((_check_in - 1)::timestamp AT TIME ZONE 'America/Puerto_Rico') + INTERVAL '9 hours';
    ELSIF _task_title LIKE 'Coordinar limpieza post-checkout%' THEN
      _service_type := 'post_checkout';
      _service_date := _check_out;
      _scheduled_for := (_check_out::timestamp AT TIME ZONE 'America/Puerto_Rico') + INTERVAL '9 hours';
    ELSE
      _service_type := NULL;
    END IF;

    IF _service_type IS NOT NULL AND _vendor.contact_id IS NOT NULL THEN
      UPDATE public.tasks
      SET assignee_contact_id = _vendor.contact_id,
          vendor_status = 'assigned',
          updated_at = now(), updated_by = _uid
      WHERE id = _task_id;

      _aa_payload := jsonb_build_object(
        'task_id', _task_id,
        'vendor_contact_id', _vendor.contact_id,
        'property_id', _property_id,
        'reservation_confirmation_code', _reservation_confirmation,
        'service_type', _service_type,
        'service_date', to_char(_service_date, 'YYYY-MM-DD'),
        'guest_checkin_date', to_char(_check_in, 'YYYY-MM-DD')
      );
      _aa_idem := 'cleaning:notify:' || _task_id::text;

      INSERT INTO public.agent_actions (
        user_id, source_type, source_ref, agent_name, action_type, payload,
        confidence_score, requires_approval, idempotency_key, status, scheduled_for
      ) VALUES (
        _uid, 'system', _task_id::text, 'cleaning_coordinator',
        'notify_vendor_cleaning', _aa_payload,
        1.0, false, _aa_idem, 'proposed', _scheduled_for
      )
      ON CONFLICT (user_id, idempotency_key) WHERE (idempotency_key IS NOT NULL) DO NOTHING
      RETURNING id INTO _new_aa_id;

      INSERT INTO public.events (user_id, entity_type, entity_id, action, metadata)
      VALUES (_uid, 'task', _task_id, 'vendor_assigned',
              jsonb_build_object(
                'vendor_contact_id', _vendor.contact_id,
                'vendor_name', _vendor.name,
                'service_type', _service_type,
                'scheduled_notify_for', _scheduled_for,
                'agent_action_id', _new_aa_id
              ));
    END IF;
  END LOOP;

  RETURN _mission_id;
END;
$function$;