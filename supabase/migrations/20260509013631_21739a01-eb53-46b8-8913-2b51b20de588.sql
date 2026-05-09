-- 1. properties.default_area_id
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS default_area_id uuid REFERENCES public.areas(id) ON DELETE SET NULL;

-- 2. execute_agent_action extendida con create_reservation_with_mission
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

    -- Property must belong to current user
    SELECT * INTO _property
    FROM public.properties
    WHERE id = (_payload->>'property_id')::uuid
      AND deleted_at IS NULL;
    IF NOT FOUND OR _property.user_id <> _uid THEN
      RAISE EXCEPTION 'property_not_found_or_forbidden' USING ERRCODE = '42501';
    END IF;

    -- Create mission + tasks via template
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

    -- Create reservation linked to that mission
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