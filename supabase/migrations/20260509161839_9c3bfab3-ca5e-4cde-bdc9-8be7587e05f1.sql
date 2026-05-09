
-- 1) Allow 'cancelled' as a valid audit action
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_action_check;
ALTER TABLE public.events ADD CONSTRAINT events_action_check
  CHECK (action = ANY (ARRAY[
    'created','updated','completed','due_changed','status_changed',
    'deleted','restored','executed','approved','rejected','failed',
    'cancelled'
  ]));

-- 2) Persist template offsets on tasks for date recalculation
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS template_task_offset_days integer,
  ADD COLUMN IF NOT EXISTS template_task_offset_anchor text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tasks_template_offset_anchor_check'
  ) THEN
    ALTER TABLE public.tasks
      ADD CONSTRAINT tasks_template_offset_anchor_check
      CHECK (template_task_offset_anchor IS NULL
             OR template_task_offset_anchor IN ('check_in','check_out'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS tasks_template_offset_idx
  ON public.tasks (mission_id)
  WHERE template_task_offset_days IS NOT NULL AND deleted_at IS NULL;

-- 3) instantiate_template: persist offsets on each task
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
  _anchor text;
  _offset_days int;
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
    _anchor := COALESCE(_offset->>'relative_to', 'check_in');
    _offset_days := COALESCE((_offset->>'due_offset_days')::int, 0);
    _base_date := CASE _anchor WHEN 'check_out' THEN _check_out ELSE _check_in END;
    _due := _base_date + _offset_days;

    INSERT INTO public.tasks (
      user_id, mission_id, title, notes, due_date,
      friction_level, effort_minutes, is_today, agent_action_id,
      template_task_offset_days, template_task_offset_anchor
    ) VALUES (
      _uid, _mission_id, _offset->>'title', _offset->>'notes', _due,
      COALESCE((_offset->>'friction_level')::int, 2),
      NULLIF(_offset->>'effort_minutes','')::int,
      COALESCE((_offset->>'is_today')::boolean, false),
      _aa_id,
      _offset_days,
      _anchor
    );
  END LOOP;

  RETURN _mission_id;
END;
$function$;

-- 4) execute_agent_action: add cancel_reservation + update_reservation branches
CREATE OR REPLACE FUNCTION public.execute_agent_action(_action_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _action record;
  _dup record;
  _payload jsonb;
  _result jsonb;
  _new_id uuid;
  _mission_id uuid;
  _reservation_id uuid;
  _property record;
  _res jsonb;
  _miss jsonb;
  _tasks_count int;
  -- update/cancel locals
  _updates jsonb;
  _recalc boolean;
  _allowed_keys text[] := ARRAY[
    'check_in_date','check_out_date','check_in_time','check_out_time',
    'guest_name','guest_email','guest_phone','number_of_guests',
    'payout_amount','cleaning_fee','taxes_or_fees'
  ];
  _key text; _val text; _bad text;
  _existing_res record;
  _new_check_in date; _new_check_out date;
  _tasks_with_offsets int;
  _tasks_total int;
  _recalc_skipped boolean := false;
  _recalc_skipped_reason text;
  _changed_keys text[];
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO _action
  FROM public.agent_actions
  WHERE id = _action_id
  FOR UPDATE;

  IF NOT FOUND OR _action.user_id <> _uid THEN
    RAISE NOTICE 'execute_agent_action: not_found_or_forbidden id=% uid=%', _action_id, _uid;
    RAISE EXCEPTION 'not_found_or_forbidden' USING ERRCODE = '42501';
  END IF;

  IF _action.status = 'executed' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'already', true,
      'action_id', _action.id,
      'result', _action.result
    );
  END IF;

  IF _action.status NOT IN ('proposed', 'approved') THEN
    RAISE EXCEPTION 'invalid_state: %', _action.status USING ERRCODE = '22023';
  END IF;

  IF _action.idempotency_key IS NOT NULL THEN
    SELECT id, result INTO _dup
    FROM public.agent_actions
    WHERE idempotency_key = _action.idempotency_key
      AND user_id = _uid
      AND status = 'executed'
      AND id <> _action.id
    LIMIT 1;

    IF FOUND THEN
      _result := jsonb_build_object('duplicate_of', _dup.id, 'original_result', _dup.result);
      UPDATE public.agent_actions
      SET status = 'executed',
          result = _result,
          executed_at = now(),
          executed_by = _uid,
          approved_at = COALESCE(approved_at, now()),
          approved_by = COALESCE(approved_by, _uid)
      WHERE id = _action.id;

      INSERT INTO public.events (user_id, entity_type, entity_id, action, metadata)
      VALUES (_uid, 'agent_action', _action.id, 'executed',
              jsonb_build_object('source', 'execute_agent_action', 'duplicate_of', _dup.id));

      RETURN jsonb_build_object('ok', true, 'duplicate', true, 'action_id', _action.id, 'result', _result);
    END IF;
  END IF;

  _payload := COALESCE(_action.payload, '{}'::jsonb);

  -- Defense in depth: minimum payload keys per action_type
  IF _action.action_type = 'create_task' THEN
    IF NULLIF(_payload->>'mission_id','') IS NULL OR NULLIF(_payload->>'title','') IS NULL THEN
      RAISE EXCEPTION 'invalid_payload: create_task requires mission_id and title' USING ERRCODE = '22023';
    END IF;
  ELSIF _action.action_type = 'create_mission' THEN
    IF NULLIF(_payload->>'title','') IS NULL THEN
      RAISE EXCEPTION 'invalid_payload: create_mission requires title' USING ERRCODE = '22023';
    END IF;
  ELSIF _action.action_type = 'create_reservation' THEN
    IF NULLIF(_payload->>'property_id','') IS NULL
       OR NULLIF(_payload->>'check_in_date','') IS NULL
       OR NULLIF(_payload->>'check_out_date','') IS NULL THEN
      RAISE EXCEPTION 'invalid_payload: create_reservation requires property_id, check_in_date, check_out_date' USING ERRCODE = '22023';
    END IF;
  ELSIF _action.action_type = 'update_task' THEN
    IF NULLIF(_payload->>'task_id','') IS NULL THEN
      RAISE EXCEPTION 'invalid_payload: update_task requires task_id' USING ERRCODE = '22023';
    END IF;
  ELSIF _action.action_type = 'create_reservation_with_mission' THEN
    IF NULLIF(_payload->>'property_id','') IS NULL THEN
      RAISE EXCEPTION 'invalid_payload: create_reservation_with_mission requires property_id' USING ERRCODE = '22023';
    END IF;
    IF NOT (_payload ? 'reservation') OR NOT (_payload->'reservation' ?& array['source','confirmation_code','check_in_date','check_out_date']) THEN
      RAISE EXCEPTION 'invalid_payload: reservation requires source, confirmation_code, check_in_date, check_out_date' USING ERRCODE = '22023';
    END IF;
    IF NOT (_payload ? 'mission') OR NOT (_payload->'mission' ?& array['template_id','title']) THEN
      RAISE EXCEPTION 'invalid_payload: mission requires template_id, title' USING ERRCODE = '22023';
    END IF;
  ELSIF _action.action_type = 'cancel_reservation' THEN
    IF NULLIF(_payload->>'reservation_id','') IS NULL THEN
      RAISE EXCEPTION 'invalid_payload: cancel_reservation requires reservation_id' USING ERRCODE = '22023';
    END IF;
  ELSIF _action.action_type = 'update_reservation' THEN
    IF NULLIF(_payload->>'reservation_id','') IS NULL THEN
      RAISE EXCEPTION 'invalid_payload: update_reservation requires reservation_id' USING ERRCODE = '22023';
    END IF;
    IF NOT (_payload ? 'updates') OR jsonb_typeof(_payload->'updates') <> 'object' THEN
      RAISE EXCEPTION 'invalid_payload: update_reservation requires updates object' USING ERRCODE = '22023';
    END IF;
    IF (SELECT count(*) FROM jsonb_object_keys(_payload->'updates')) = 0 THEN
      RAISE EXCEPTION 'invalid_payload: updates must be non-empty' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Dispatch
  IF _action.action_type = 'create_task' THEN
    INSERT INTO public.tasks (
      user_id, mission_id, title, notes, due_date, friction_level, is_today, agent_action_id
    ) VALUES (
      _uid,
      NULLIF(_payload->>'mission_id','')::uuid,
      _payload->>'title',
      _payload->>'notes',
      NULLIF(_payload->>'due_date','')::date,
      COALESCE((_payload->>'friction_level')::int, 2),
      COALESCE((_payload->>'is_today')::boolean, false),
      _action.id
    )
    RETURNING id INTO _new_id;
    _result := jsonb_build_object('task_id', _new_id);

  ELSIF _action.action_type = 'create_mission' THEN
    INSERT INTO public.missions (
      user_id, area_id, title, description, priority, due_date, reward_text, agent_action_id
    ) VALUES (
      _uid,
      NULLIF(_payload->>'area_id','')::uuid,
      _payload->>'title',
      _payload->>'description',
      COALESCE(_payload->>'priority', 'mid'),
      NULLIF(_payload->>'due_date','')::date,
      _payload->>'reward_text',
      _action.id
    )
    RETURNING id INTO _new_id;
    _result := jsonb_build_object('mission_id', _new_id);

  ELSIF _action.action_type = 'create_reservation' THEN
    INSERT INTO public.reservations (
      user_id, property_id, source, confirmation_code, guest_name, guest_email, guest_phone,
      check_in_date, check_out_date, check_in_time, check_out_time, number_of_guests,
      payout_amount, cleaning_fee, taxes_or_fees, status, confidence_score, notes
    ) VALUES (
      _uid,
      NULLIF(_payload->>'property_id','')::uuid,
      COALESCE(_payload->>'source', 'manual'),
      _payload->>'confirmation_code',
      _payload->>'guest_name',
      _payload->>'guest_email',
      _payload->>'guest_phone',
      NULLIF(_payload->>'check_in_date','')::date,
      NULLIF(_payload->>'check_out_date','')::date,
      NULLIF(_payload->>'check_in_time','')::time,
      NULLIF(_payload->>'check_out_time','')::time,
      NULLIF(_payload->>'number_of_guests','')::int,
      NULLIF(_payload->>'payout_amount','')::numeric,
      NULLIF(_payload->>'cleaning_fee','')::numeric,
      NULLIF(_payload->>'taxes_or_fees','')::numeric,
      COALESCE(_payload->>'status', 'confirmed'),
      NULLIF(_payload->>'confidence_score','')::real,
      _payload->>'notes'
    )
    RETURNING id INTO _new_id;
    _result := jsonb_build_object('reservation_id', _new_id);

  ELSIF _action.action_type = 'update_task' THEN
    UPDATE public.tasks SET
      title = COALESCE(_payload->>'title', title),
      notes = COALESCE(_payload->>'notes', notes),
      status = COALESCE(_payload->>'status', status),
      due_date = COALESCE(NULLIF(_payload->>'due_date','')::date, due_date),
      is_today = COALESCE((_payload->>'is_today')::boolean, is_today),
      friction_level = COALESCE((_payload->>'friction_level')::int, friction_level)
    WHERE id = (_payload->>'task_id')::uuid AND user_id = _uid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'task_not_found_or_forbidden' USING ERRCODE = '42501';
    END IF;
    _result := jsonb_build_object('task_id', _payload->>'task_id');

  ELSIF _action.action_type = 'create_reservation_with_mission' THEN
    _res := _payload->'reservation';
    _miss := _payload->'mission';

    SELECT * INTO _property
    FROM public.properties
    WHERE id = (_payload->>'property_id')::uuid
      AND deleted_at IS NULL;
    IF NOT FOUND OR _property.user_id <> _uid THEN
      RAISE EXCEPTION 'property_not_found_or_forbidden' USING ERRCODE = '42501';
    END IF;

    _mission_id := public.instantiate_template(
      (_miss->>'template_id')::uuid,
      jsonb_build_object(
        'title', _miss->>'title',
        'area_id', COALESCE(NULLIF(_miss->>'area_id',''), _property.default_area_id::text),
        'check_in_date', _res->>'check_in_date',
        'check_out_date', _res->>'check_out_date',
        'agent_action_id', _action.id::text
      )
    );

    INSERT INTO public.reservations (
      user_id, property_id, mission_id, source, confirmation_code,
      guest_name, guest_email, guest_phone,
      check_in_date, check_out_date, check_in_time, check_out_time, number_of_guests,
      payout_amount, cleaning_fee, taxes_or_fees, status, confidence_score,
      source_email_ids, agent_action_id, notes
    ) VALUES (
      _uid,
      _property.id,
      _mission_id,
      COALESCE(_res->>'source', 'airbnb'),
      _res->>'confirmation_code',
      _res->>'guest_name',
      _res->>'guest_email',
      _res->>'guest_phone',
      NULLIF(_res->>'check_in_date','')::date,
      NULLIF(_res->>'check_out_date','')::date,
      NULLIF(_res->>'check_in_time','')::time,
      NULLIF(_res->>'check_out_time','')::time,
      NULLIF(_res->>'number_of_guests','')::int,
      NULLIF(_res->>'payout_amount','')::numeric,
      NULLIF(_res->>'cleaning_fee','')::numeric,
      NULLIF(_res->>'taxes_or_fees','')::numeric,
      'confirmed',
      _action.confidence_score,
      CASE
        WHEN _res ? 'source_email_ids' AND jsonb_typeof(_res->'source_email_ids') = 'array'
          THEN ARRAY(SELECT jsonb_array_elements_text(_res->'source_email_ids'))
        ELSE NULL
      END,
      _action.id,
      _res->>'notes'
    )
    RETURNING id INTO _reservation_id;

    SELECT count(*) INTO _tasks_count FROM public.tasks WHERE mission_id = _mission_id;

    _result := jsonb_build_object(
      'mission_id', _mission_id,
      'reservation_id', _reservation_id,
      'tasks_created', _tasks_count
    );

  ELSIF _action.action_type = 'cancel_reservation' THEN
    _reservation_id := (_payload->>'reservation_id')::uuid;

    SELECT id, mission_id, status INTO _existing_res
    FROM public.reservations
    WHERE id = _reservation_id
      AND user_id = _uid
      AND deleted_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'reservation_not_found_or_forbidden' USING ERRCODE = '42501';
    END IF;

    _mission_id := _existing_res.mission_id;

    UPDATE public.reservations
    SET status = 'cancelled',
        updated_at = now(),
        updated_by = _uid
    WHERE id = _reservation_id
      AND user_id = _uid
      AND deleted_at IS NULL;

    IF _mission_id IS NOT NULL THEN
      UPDATE public.missions
      SET deleted_at = now(),
          deleted_by = _uid,
          updated_at = now(),
          updated_by = _uid
      WHERE id = _mission_id
        AND user_id = _uid
        AND deleted_at IS NULL;

      UPDATE public.tasks
      SET deleted_at = now(),
          deleted_by = _uid,
          updated_at = now(),
          updated_by = _uid
      WHERE mission_id = _mission_id
        AND user_id = _uid
        AND deleted_at IS NULL;
    END IF;

    -- 1 semantic cancellation event on the reservation; trigger audit_change
    -- already records the underlying soft-deletes individually.
    INSERT INTO public.events (user_id, entity_type, entity_id, action, metadata)
    VALUES (_uid, 'reservation', _reservation_id, 'cancelled',
            jsonb_build_object(
              'cancelled_by', COALESCE(_payload->>'cancelled_by', 'unknown'),
              'agent_action_id', _action.id,
              'mission_id', _mission_id,
              'cancellation_email_id', _payload->>'cancellation_email_id'
            ));

    _result := jsonb_build_object(
      'reservation_id', _reservation_id,
      'mission_id', _mission_id,
      'previous_status', _existing_res.status
    );

  ELSIF _action.action_type = 'update_reservation' THEN
    _reservation_id := (_payload->>'reservation_id')::uuid;
    _updates := _payload->'updates';
    _recalc := COALESCE((_payload->>'recalc_task_dates')::boolean, false);

    -- Verify reservation exists + belongs to user
    SELECT id, mission_id INTO _existing_res
    FROM public.reservations
    WHERE id = _reservation_id
      AND user_id = _uid
      AND deleted_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'reservation_not_found_or_forbidden' USING ERRCODE = '42501';
    END IF;
    _mission_id := _existing_res.mission_id;

    -- Whitelist guard against SQL injection via dynamic column name
    SELECT string_agg(k, ',') INTO _bad
    FROM jsonb_object_keys(_updates) AS k
    WHERE k <> ALL (_allowed_keys);
    IF _bad IS NOT NULL THEN
      RAISE EXCEPTION 'invalid_update_field: %', _bad USING ERRCODE = '22023';
    END IF;

    SELECT array_agg(k) INTO _changed_keys FROM jsonb_object_keys(_updates) AS k;

    -- Apply each whitelisted key
    FOR _key, _val IN SELECT * FROM jsonb_each_text(_updates) LOOP
      IF _key IN ('check_in_date','check_out_date') THEN
        EXECUTE format(
          'UPDATE public.reservations SET %I = $1::date, updated_at = now(), updated_by = $2 WHERE id = $3 AND user_id = $4 AND deleted_at IS NULL',
          _key
        ) USING NULLIF(_val,''), _uid, _reservation_id, _uid;
      ELSIF _key IN ('check_in_time','check_out_time') THEN
        EXECUTE format(
          'UPDATE public.reservations SET %I = $1::time, updated_at = now(), updated_by = $2 WHERE id = $3 AND user_id = $4 AND deleted_at IS NULL',
          _key
        ) USING NULLIF(_val,''), _uid, _reservation_id, _uid;
      ELSIF _key = 'number_of_guests' THEN
        EXECUTE format(
          'UPDATE public.reservations SET %I = $1::int, updated_at = now(), updated_by = $2 WHERE id = $3 AND user_id = $4 AND deleted_at IS NULL',
          _key
        ) USING NULLIF(_val,''), _uid, _reservation_id, _uid;
      ELSIF _key IN ('payout_amount','cleaning_fee','taxes_or_fees') THEN
        EXECUTE format(
          'UPDATE public.reservations SET %I = $1::numeric, updated_at = now(), updated_by = $2 WHERE id = $3 AND user_id = $4 AND deleted_at IS NULL',
          _key
        ) USING NULLIF(_val,''), _uid, _reservation_id, _uid;
      ELSE
        EXECUTE format(
          'UPDATE public.reservations SET %I = $1, updated_at = now(), updated_by = $2 WHERE id = $3 AND user_id = $4 AND deleted_at IS NULL',
          _key
        ) USING _val, _uid, _reservation_id, _uid;
      END IF;
    END LOOP;

    -- Recalculate task due_dates if dates changed
    IF _recalc AND _mission_id IS NOT NULL THEN
      SELECT check_in_date, check_out_date INTO _new_check_in, _new_check_out
      FROM public.reservations
      WHERE id = _reservation_id AND user_id = _uid;

      SELECT
        count(*) FILTER (WHERE template_task_offset_days IS NOT NULL),
        count(*)
      INTO _tasks_with_offsets, _tasks_total
      FROM public.tasks
      WHERE mission_id = _mission_id
        AND user_id = _uid
        AND deleted_at IS NULL;

      IF _tasks_with_offsets = 0 AND _tasks_total > 0 THEN
        _recalc_skipped := true;
        _recalc_skipped_reason := 'tasks_missing_offsets';
      ELSE
        UPDATE public.tasks
        SET due_date = CASE template_task_offset_anchor
                         WHEN 'check_in'  THEN _new_check_in  + template_task_offset_days
                         WHEN 'check_out' THEN _new_check_out + template_task_offset_days
                         ELSE due_date
                       END,
            updated_at = now(),
            updated_by = _uid
        WHERE mission_id = _mission_id
          AND user_id = _uid
          AND deleted_at IS NULL
          AND template_task_offset_days IS NOT NULL
          AND template_task_offset_anchor IS NOT NULL;
      END IF;
    END IF;

    -- 1 semantic update event with full context
    INSERT INTO public.events (user_id, entity_type, entity_id, action, metadata)
    VALUES (_uid, 'reservation', _reservation_id, 'updated',
            jsonb_build_object(
              'fields', _changed_keys,
              'agent_action_id', _action.id,
              'recalc_task_dates', _recalc,
              'recalc_skipped', _recalc_skipped,
              'recalc_skipped_reason', _recalc_skipped_reason,
              'tasks_skipped_count', CASE WHEN _recalc_skipped THEN _tasks_total ELSE 0 END,
              'mission_id', _mission_id
            ));

    _result := jsonb_build_object(
      'reservation_id', _reservation_id,
      'mission_id', _mission_id,
      'fields_updated', _changed_keys,
      'recalc_task_dates', _recalc,
      'recalc_skipped', _recalc_skipped,
      'recalc_skipped_reason', _recalc_skipped_reason,
      'tasks_skipped_count', CASE WHEN _recalc_skipped THEN _tasks_total ELSE 0 END
    );

  ELSE
    RAISE EXCEPTION 'unsupported_action_type: %', _action.action_type USING ERRCODE = '22023';
  END IF;

  UPDATE public.agent_actions
  SET status = 'executed',
      result = _result,
      executed_at = now(),
      executed_by = _uid,
      approved_at = COALESCE(approved_at, now()),
      approved_by = COALESCE(approved_by, _uid)
  WHERE id = _action.id;

  INSERT INTO public.events (user_id, entity_type, entity_id, action, metadata)
  VALUES (_uid, 'agent_action', _action.id, 'executed',
          jsonb_build_object(
            'source', 'execute_agent_action',
            'action_type', _action.action_type,
            'confidence', _action.confidence_score,
            'result', _result
          ));

  RETURN jsonb_build_object('ok', true, 'action_id', _action.id, 'result', _result);
END;
$function$;
