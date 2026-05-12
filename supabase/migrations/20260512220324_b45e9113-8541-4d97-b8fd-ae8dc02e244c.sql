
-- =====================================================================
-- Sprint 3.1 — Cleaning Coordinator
-- =====================================================================

-- 1. contacts: vendor support
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS categories text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS whatsapp_phone text NULL,
  ADD COLUMN IF NOT EXISTS preferred_channel text NULL
    CHECK (preferred_channel IS NULL OR preferred_channel IN ('email','whatsapp'));

CREATE INDEX IF NOT EXISTS contacts_categories_gin
  ON public.contacts USING gin (categories);

-- 2. notifications: multi-channel
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'email'
    CHECK (channel IN ('email','whatsapp','sms','push')),
  ADD COLUMN IF NOT EXISTS phone_to text NULL,
  ADD COLUMN IF NOT EXISTS provider_message_id text NULL,
  ADD COLUMN IF NOT EXISTS read_at timestamptz NULL;

-- Allow user to update read_at on own notifications (for the bell)
DROP POLICY IF EXISTS notifications_update_own ON public.notifications;
CREATE POLICY notifications_update_own ON public.notifications
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 3. tasks: vendor coordination
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS assignee_contact_id uuid NULL
    REFERENCES public.contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vendor_status text NULL
    CHECK (vendor_status IS NULL OR vendor_status IN
      ('assigned','notified','confirmed','escalated','done')),
  ADD COLUMN IF NOT EXISTS notified_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS escalated_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS tasks_vendor_status_active
  ON public.tasks (vendor_status, due_date)
  WHERE vendor_status IN ('assigned','notified','escalated') AND deleted_at IS NULL;

-- 4. property_vendor_assignments
CREATE TABLE IF NOT EXISTS public.property_vendor_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE RESTRICT,
  vendor_category text NOT NULL,
  is_primary boolean NOT NULL DEFAULT true,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL,
  updated_by uuid NULL,
  deleted_at timestamptz NULL,
  deleted_by uuid NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS property_vendor_primary_unique
  ON public.property_vendor_assignments (property_id, vendor_category)
  WHERE is_primary = true AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS property_vendor_lookup
  ON public.property_vendor_assignments (property_id, vendor_category)
  WHERE deleted_at IS NULL;

ALTER TABLE public.property_vendor_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pva_select ON public.property_vendor_assignments;
CREATE POLICY pva_select ON public.property_vendor_assignments
  FOR SELECT TO authenticated USING (auth.uid() = user_id AND deleted_at IS NULL);

DROP POLICY IF EXISTS pva_insert ON public.property_vendor_assignments;
CREATE POLICY pva_insert ON public.property_vendor_assignments
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS pva_update ON public.property_vendor_assignments;
CREATE POLICY pva_update ON public.property_vendor_assignments
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS pva_delete ON public.property_vendor_assignments;
CREATE POLICY pva_delete ON public.property_vendor_assignments
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS audit_pva_changes ON public.property_vendor_assignments;
CREATE TRIGGER audit_pva_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.property_vendor_assignments
  FOR EACH ROW EXECUTE FUNCTION public.audit_change();

-- 5. agent_actions.scheduled_for
ALTER TABLE public.agent_actions
  ADD COLUMN IF NOT EXISTS scheduled_for timestamptz NULL;

CREATE INDEX IF NOT EXISTS agent_actions_scheduled_dispatch
  ON public.agent_actions (scheduled_for)
  WHERE status = 'proposed' AND scheduled_for IS NOT NULL AND requires_approval = false;

-- 6. events.action: extend with vendor_* + audit_change support
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_action_check;
ALTER TABLE public.events ADD CONSTRAINT events_action_check
  CHECK (action = ANY (ARRAY[
    'created','updated','completed','due_changed','status_changed',
    'deleted','restored','executed','approved','rejected','failed','cancelled',
    'calendar_event_created','calendar_event_updated','calendar_event_deleted','calendar_event_skipped',
    'vendor_assigned','vendor_notified','vendor_confirmed','vendor_escalated','vendor_unassigned'
  ]));

-- =====================================================================
-- 7. instantiate_template — extended to auto-enqueue cleaning notify
-- =====================================================================
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
  -- vendor enqueue locals
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

  -- Resolve cleaning vendor (primary, active) for this property if any
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

    -- Auto-enqueue vendor notify for cleaning tasks if vendor configured
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
      ON CONFLICT (user_id, idempotency_key) DO NOTHING
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

-- =====================================================================
-- 8. execute_agent_action — add vendor branches
-- =====================================================================
CREATE OR REPLACE FUNCTION public.execute_agent_action(_action_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _action record; _dup record; _payload jsonb; _result jsonb;
  _new_id uuid; _mission_id uuid; _reservation_id uuid; _property record;
  _res jsonb; _miss jsonb; _tasks_count int;
  _updates jsonb; _recalc boolean;
  _allowed_keys text[] := ARRAY[
    'check_in_date','check_out_date','check_in_time','check_out_time',
    'guest_name','guest_email','guest_phone','number_of_guests',
    'payout_amount','cleaning_fee','taxes_or_fees'
  ];
  _key text; _val text; _bad text;
  _existing_res record; _new_check_in date; _new_check_out date;
  _tasks_with_offsets int; _tasks_total int;
  _recalc_skipped boolean := false; _recalc_skipped_reason text;
  _changed_keys text[];
  -- vendor branch locals
  _task_id uuid; _task record; _vendor_name text; _hours_until int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;

  SELECT * INTO _action FROM public.agent_actions WHERE id = _action_id FOR UPDATE;
  IF NOT FOUND OR _action.user_id <> _uid THEN
    RAISE EXCEPTION 'not_found_or_forbidden' USING ERRCODE = '42501';
  END IF;

  IF _action.status = 'executed' THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'action_id', _action.id, 'result', _action.result);
  END IF;

  IF _action.status NOT IN ('proposed', 'approved') THEN
    RAISE EXCEPTION 'invalid_state: %', _action.status USING ERRCODE = '22023';
  END IF;

  IF _action.idempotency_key IS NOT NULL THEN
    SELECT id, result INTO _dup FROM public.agent_actions
    WHERE idempotency_key = _action.idempotency_key AND user_id = _uid
      AND status = 'executed' AND id <> _action.id LIMIT 1;
    IF FOUND THEN
      _result := jsonb_build_object('duplicate_of', _dup.id, 'original_result', _dup.result);
      UPDATE public.agent_actions SET status='executed', result=_result, executed_at=now(),
        executed_by=_uid, approved_at=COALESCE(approved_at,now()), approved_by=COALESCE(approved_by,_uid)
        WHERE id = _action.id;
      INSERT INTO public.events (user_id, entity_type, entity_id, action, metadata)
      VALUES (_uid, 'agent_action', _action.id, 'executed',
              jsonb_build_object('source','execute_agent_action','duplicate_of',_dup.id));
      RETURN jsonb_build_object('ok', true, 'duplicate', true, 'action_id', _action.id, 'result', _result);
    END IF;
  END IF;

  _payload := COALESCE(_action.payload, '{}'::jsonb);

  -- Defense-in-depth payload checks
  IF _action.action_type = 'create_task' THEN
    IF NULLIF(_payload->>'mission_id','') IS NULL OR NULLIF(_payload->>'title','') IS NULL THEN
      RAISE EXCEPTION 'invalid_payload: create_task requires mission_id and title' USING ERRCODE = '22023';
    END IF;
  ELSIF _action.action_type = 'create_mission' THEN
    IF NULLIF(_payload->>'title','') IS NULL THEN
      RAISE EXCEPTION 'invalid_payload: create_mission requires title' USING ERRCODE = '22023';
    END IF;
  ELSIF _action.action_type = 'create_reservation' THEN
    IF NULLIF(_payload->>'property_id','') IS NULL OR NULLIF(_payload->>'check_in_date','') IS NULL OR NULLIF(_payload->>'check_out_date','') IS NULL THEN
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
  ELSIF _action.action_type = 'mark_vendor_confirmed' THEN
    IF NULLIF(_payload->>'task_id','') IS NULL THEN
      RAISE EXCEPTION 'invalid_payload: mark_vendor_confirmed requires task_id' USING ERRCODE = '22023';
    END IF;
  ELSIF _action.action_type = 'escalate_vendor_no_response' THEN
    IF NULLIF(_payload->>'task_id','') IS NULL THEN
      RAISE EXCEPTION 'invalid_payload: escalate_vendor_no_response requires task_id' USING ERRCODE = '22023';
    END IF;
  ELSIF _action.action_type = 'notify_vendor_cleaning' THEN
    -- Deferred to edge function; do not execute synchronously here.
    RAISE EXCEPTION 'notify_vendor_cleaning is dispatched by cleaning-notify-vendor edge function, not execute_agent_action' USING ERRCODE = '22023';
  END IF;

  -- Dispatch
  IF _action.action_type = 'create_task' THEN
    INSERT INTO public.tasks (user_id, mission_id, title, notes, due_date, friction_level, is_today, agent_action_id)
    VALUES (_uid, NULLIF(_payload->>'mission_id','')::uuid, _payload->>'title', _payload->>'notes',
            NULLIF(_payload->>'due_date','')::date, COALESCE((_payload->>'friction_level')::int, 2),
            COALESCE((_payload->>'is_today')::boolean, false), _action.id) RETURNING id INTO _new_id;
    _result := jsonb_build_object('task_id', _new_id);

  ELSIF _action.action_type = 'create_mission' THEN
    INSERT INTO public.missions (user_id, area_id, title, description, priority, due_date, reward_text, agent_action_id)
    VALUES (_uid, NULLIF(_payload->>'area_id','')::uuid, _payload->>'title', _payload->>'description',
            COALESCE(_payload->>'priority','mid'), NULLIF(_payload->>'due_date','')::date,
            _payload->>'reward_text', _action.id) RETURNING id INTO _new_id;
    _result := jsonb_build_object('mission_id', _new_id);

  ELSIF _action.action_type = 'create_reservation' THEN
    INSERT INTO public.reservations (user_id, property_id, source, confirmation_code, guest_name, guest_email, guest_phone,
      check_in_date, check_out_date, check_in_time, check_out_time, number_of_guests,
      payout_amount, cleaning_fee, taxes_or_fees, status, confidence_score, notes)
    VALUES (_uid, NULLIF(_payload->>'property_id','')::uuid, COALESCE(_payload->>'source','manual'),
      _payload->>'confirmation_code', _payload->>'guest_name', _payload->>'guest_email', _payload->>'guest_phone',
      NULLIF(_payload->>'check_in_date','')::date, NULLIF(_payload->>'check_out_date','')::date,
      NULLIF(_payload->>'check_in_time','')::time, NULLIF(_payload->>'check_out_time','')::time,
      NULLIF(_payload->>'number_of_guests','')::int, NULLIF(_payload->>'payout_amount','')::numeric,
      NULLIF(_payload->>'cleaning_fee','')::numeric, NULLIF(_payload->>'taxes_or_fees','')::numeric,
      COALESCE(_payload->>'status','confirmed'), NULLIF(_payload->>'confidence_score','')::real, _payload->>'notes')
    RETURNING id INTO _new_id;
    _result := jsonb_build_object('reservation_id', _new_id);

  ELSIF _action.action_type = 'update_task' THEN
    UPDATE public.tasks SET
      title = COALESCE(_payload->>'title', title), notes = COALESCE(_payload->>'notes', notes),
      status = COALESCE(_payload->>'status', status),
      due_date = COALESCE(NULLIF(_payload->>'due_date','')::date, due_date),
      is_today = COALESCE((_payload->>'is_today')::boolean, is_today),
      friction_level = COALESCE((_payload->>'friction_level')::int, friction_level)
    WHERE id = (_payload->>'task_id')::uuid AND user_id = _uid;
    IF NOT FOUND THEN RAISE EXCEPTION 'task_not_found_or_forbidden' USING ERRCODE='42501'; END IF;
    _result := jsonb_build_object('task_id', _payload->>'task_id');

  ELSIF _action.action_type = 'create_reservation_with_mission' THEN
    _res := _payload->'reservation';
    _miss := _payload->'mission';
    SELECT * INTO _property FROM public.properties
    WHERE id = (_payload->>'property_id')::uuid AND deleted_at IS NULL;
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
        'agent_action_id', _action.id::text,
        'property_id', _property.id::text,
        'confirmation_code', _res->>'confirmation_code'
      )
    );
    INSERT INTO public.reservations (user_id, property_id, mission_id, source, confirmation_code,
      guest_name, guest_email, guest_phone, check_in_date, check_out_date, check_in_time, check_out_time,
      number_of_guests, payout_amount, cleaning_fee, taxes_or_fees, status, confidence_score,
      source_email_ids, agent_action_id, notes)
    VALUES (_uid, _property.id, _mission_id, COALESCE(_res->>'source','airbnb'),
      _res->>'confirmation_code', _res->>'guest_name', _res->>'guest_email', _res->>'guest_phone',
      NULLIF(_res->>'check_in_date','')::date, NULLIF(_res->>'check_out_date','')::date,
      NULLIF(_res->>'check_in_time','')::time, NULLIF(_res->>'check_out_time','')::time,
      NULLIF(_res->>'number_of_guests','')::int, NULLIF(_res->>'payout_amount','')::numeric,
      NULLIF(_res->>'cleaning_fee','')::numeric, NULLIF(_res->>'taxes_or_fees','')::numeric,
      'confirmed', _action.confidence_score,
      CASE WHEN _res ? 'source_email_ids' AND jsonb_typeof(_res->'source_email_ids')='array'
        THEN ARRAY(SELECT jsonb_array_elements_text(_res->'source_email_ids')) ELSE NULL END,
      _action.id, _res->>'notes')
    RETURNING id INTO _reservation_id;
    SELECT count(*) INTO _tasks_count FROM public.tasks WHERE mission_id = _mission_id;
    _result := jsonb_build_object('mission_id', _mission_id, 'reservation_id', _reservation_id, 'tasks_created', _tasks_count);

  ELSIF _action.action_type = 'cancel_reservation' THEN
    _reservation_id := (_payload->>'reservation_id')::uuid;
    SELECT id, mission_id, status INTO _existing_res FROM public.reservations
    WHERE id = _reservation_id AND user_id = _uid AND deleted_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'reservation_not_found_or_forbidden' USING ERRCODE='42501'; END IF;
    _mission_id := _existing_res.mission_id;
    UPDATE public.reservations SET status='cancelled', updated_at=now(), updated_by=_uid
      WHERE id = _reservation_id AND user_id = _uid AND deleted_at IS NULL;
    IF _mission_id IS NOT NULL THEN
      UPDATE public.missions SET deleted_at=now(), deleted_by=_uid, updated_at=now(), updated_by=_uid
        WHERE id = _mission_id AND user_id = _uid AND deleted_at IS NULL;
      UPDATE public.tasks SET deleted_at=now(), deleted_by=_uid, updated_at=now(), updated_by=_uid
        WHERE mission_id = _mission_id AND user_id = _uid AND deleted_at IS NULL;
    END IF;
    INSERT INTO public.events (user_id, entity_type, entity_id, action, metadata)
    VALUES (_uid, 'reservation', _reservation_id, 'cancelled',
            jsonb_build_object('cancelled_by', COALESCE(_payload->>'cancelled_by','unknown'),
              'agent_action_id', _action.id, 'mission_id', _mission_id,
              'cancellation_email_id', _payload->>'cancellation_email_id'));
    _result := jsonb_build_object('reservation_id', _reservation_id, 'mission_id', _mission_id, 'previous_status', _existing_res.status);

  ELSIF _action.action_type = 'update_reservation' THEN
    _reservation_id := (_payload->>'reservation_id')::uuid;
    _updates := _payload->'updates';
    _recalc := COALESCE((_payload->>'recalc_task_dates')::boolean, false);
    SELECT id, mission_id INTO _existing_res FROM public.reservations
    WHERE id = _reservation_id AND user_id = _uid AND deleted_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'reservation_not_found_or_forbidden' USING ERRCODE='42501'; END IF;
    _mission_id := _existing_res.mission_id;
    SELECT string_agg(k, ',') INTO _bad FROM jsonb_object_keys(_updates) AS k WHERE k <> ALL (_allowed_keys);
    IF _bad IS NOT NULL THEN RAISE EXCEPTION 'invalid_update_field: %', _bad USING ERRCODE='22023'; END IF;
    SELECT array_agg(k) INTO _changed_keys FROM jsonb_object_keys(_updates) AS k;
    FOR _key, _val IN SELECT * FROM jsonb_each_text(_updates) LOOP
      IF _key IN ('check_in_date','check_out_date') THEN
        EXECUTE format('UPDATE public.reservations SET %I = $1::date, updated_at=now(), updated_by=$2 WHERE id=$3 AND user_id=$4 AND deleted_at IS NULL', _key)
          USING NULLIF(_val,''), _uid, _reservation_id, _uid;
      ELSIF _key IN ('check_in_time','check_out_time') THEN
        EXECUTE format('UPDATE public.reservations SET %I = $1::time, updated_at=now(), updated_by=$2 WHERE id=$3 AND user_id=$4 AND deleted_at IS NULL', _key)
          USING NULLIF(_val,''), _uid, _reservation_id, _uid;
      ELSIF _key = 'number_of_guests' THEN
        EXECUTE format('UPDATE public.reservations SET %I = $1::int, updated_at=now(), updated_by=$2 WHERE id=$3 AND user_id=$4 AND deleted_at IS NULL', _key)
          USING NULLIF(_val,''), _uid, _reservation_id, _uid;
      ELSIF _key IN ('payout_amount','cleaning_fee','taxes_or_fees') THEN
        EXECUTE format('UPDATE public.reservations SET %I = $1::numeric, updated_at=now(), updated_by=$2 WHERE id=$3 AND user_id=$4 AND deleted_at IS NULL', _key)
          USING NULLIF(_val,''), _uid, _reservation_id, _uid;
      ELSE
        EXECUTE format('UPDATE public.reservations SET %I = $1, updated_at=now(), updated_by=$2 WHERE id=$3 AND user_id=$4 AND deleted_at IS NULL', _key)
          USING _val, _uid, _reservation_id, _uid;
      END IF;
    END LOOP;
    IF _recalc AND _mission_id IS NOT NULL THEN
      SELECT check_in_date, check_out_date INTO _new_check_in, _new_check_out
      FROM public.reservations WHERE id = _reservation_id AND user_id = _uid;
      SELECT count(*) FILTER (WHERE template_task_offset_days IS NOT NULL), count(*)
      INTO _tasks_with_offsets, _tasks_total FROM public.tasks
      WHERE mission_id = _mission_id AND user_id = _uid AND deleted_at IS NULL;
      IF _tasks_with_offsets = 0 AND _tasks_total > 0 THEN
        _recalc_skipped := true; _recalc_skipped_reason := 'tasks_missing_offsets';
      ELSE
        UPDATE public.tasks SET due_date = CASE template_task_offset_anchor
            WHEN 'check_in' THEN _new_check_in + template_task_offset_days
            WHEN 'check_out' THEN _new_check_out + template_task_offset_days
            ELSE due_date END,
          updated_at = now(), updated_by = _uid
        WHERE mission_id = _mission_id AND user_id = _uid AND deleted_at IS NULL
          AND template_task_offset_days IS NOT NULL AND template_task_offset_anchor IS NOT NULL;
      END IF;
    END IF;
    INSERT INTO public.events (user_id, entity_type, entity_id, action, metadata)
    VALUES (_uid, 'reservation', _reservation_id, 'updated',
            jsonb_build_object('fields', _changed_keys, 'agent_action_id', _action.id,
              'recalc_task_dates', _recalc, 'recalc_skipped', _recalc_skipped,
              'recalc_skipped_reason', _recalc_skipped_reason,
              'tasks_skipped_count', CASE WHEN _recalc_skipped THEN _tasks_total ELSE 0 END,
              'mission_id', _mission_id));
    _result := jsonb_build_object('reservation_id', _reservation_id, 'mission_id', _mission_id,
      'fields_updated', _changed_keys, 'recalc_task_dates', _recalc,
      'recalc_skipped', _recalc_skipped, 'recalc_skipped_reason', _recalc_skipped_reason,
      'tasks_skipped_count', CASE WHEN _recalc_skipped THEN _tasks_total ELSE 0 END);

  ELSIF _action.action_type = 'mark_vendor_confirmed' THEN
    _task_id := (_payload->>'task_id')::uuid;
    UPDATE public.tasks
    SET confirmed_at = now(), vendor_status = 'confirmed', updated_at = now(), updated_by = _uid
    WHERE id = _task_id AND user_id = _uid AND deleted_at IS NULL
    RETURNING id, mission_id INTO _task;
    IF NOT FOUND THEN RAISE EXCEPTION 'task_not_found_or_forbidden' USING ERRCODE='42501'; END IF;
    INSERT INTO public.events (user_id, entity_type, entity_id, action, metadata)
    VALUES (_uid, 'task', _task_id, 'vendor_confirmed',
            jsonb_build_object('confirmed_via', COALESCE(_payload->>'confirmed_via','manual'),
              'vendor_message', _payload->>'vendor_message',
              'agent_action_id', _action.id));
    _result := jsonb_build_object('task_id', _task_id);

  ELSIF _action.action_type = 'escalate_vendor_no_response' THEN
    _task_id := (_payload->>'task_id')::uuid;
    SELECT t.id, t.mission_id, t.title, t.vendor_status, t.assignee_contact_id, c.name AS vendor_name
    INTO _task
    FROM public.tasks t LEFT JOIN public.contacts c ON c.id = t.assignee_contact_id
    WHERE t.id = _task_id AND t.user_id = _uid AND t.deleted_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'task_not_found_or_forbidden' USING ERRCODE='42501'; END IF;

    UPDATE public.tasks SET escalated_at = now(), vendor_status = 'escalated',
      updated_at = now(), updated_by = _uid
    WHERE id = _task_id AND user_id = _uid;

    -- Notification row for Carlos (in-app push channel)
    INSERT INTO public.notifications (user_id, type, channel, task_id, subject, status)
    VALUES (_uid, 'vendor_escalation', 'push', _task_id,
            'Vendor sin respuesta: ' || COALESCE(_task.vendor_name, 'sin asignar') || ' — ' || _task.title,
            'sent');

    INSERT INTO public.events (user_id, entity_type, entity_id, action, metadata)
    VALUES (_uid, 'task', _task_id, 'vendor_escalated',
            jsonb_build_object(
              'reason', COALESCE(_payload->>'reason', 'no_response'),
              'hours_until_checkin', NULLIF(_payload->>'hours_until_checkin','')::int,
              'previous_vendor_status', _task.vendor_status,
              'vendor_contact_id', _task.assignee_contact_id,
              'agent_action_id', _action.id));
    _result := jsonb_build_object('task_id', _task_id, 'previous_vendor_status', _task.vendor_status);

  ELSE
    RAISE EXCEPTION 'unsupported_action_type: %', _action.action_type USING ERRCODE = '22023';
  END IF;

  UPDATE public.agent_actions SET status='executed', result=_result, executed_at=now(),
    executed_by=_uid, approved_at=COALESCE(approved_at, now()), approved_by=COALESCE(approved_by, _uid)
  WHERE id = _action.id;

  INSERT INTO public.events (user_id, entity_type, entity_id, action, metadata)
  VALUES (_uid, 'agent_action', _action.id, 'executed',
          jsonb_build_object('source','execute_agent_action','action_type', _action.action_type,
            'confidence', _action.confidence_score, 'result', _result));

  RETURN jsonb_build_object('ok', true, 'action_id', _action.id, 'result', _result);
END;
$function$;

-- =====================================================================
-- 9. finalize_notify_vendor — called by edge function after send attempt
-- =====================================================================
CREATE OR REPLACE FUNCTION public.finalize_notify_vendor(
  _action_id uuid,
  _mode text,                       -- 'sent' | 'failed' | 'skipped'
  _channel text DEFAULT NULL,       -- 'whatsapp' | 'email'
  _provider_message_id text DEFAULT NULL,
  _to_address text DEFAULT NULL,    -- email or phone actually used
  _error_message text DEFAULT NULL,
  _extra jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _action record; _task_id uuid; _task record; _result jsonb;
  _uid uuid;
BEGIN
  SELECT * INTO _action FROM public.agent_actions WHERE id = _action_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'action_not_found' USING ERRCODE='42501'; END IF;
  _uid := _action.user_id;

  IF _action.action_type <> 'notify_vendor_cleaning' THEN
    RAISE EXCEPTION 'wrong_action_type: %', _action.action_type USING ERRCODE='22023';
  END IF;
  IF _action.status = 'executed' THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'result', _action.result);
  END IF;

  _task_id := (_action.payload->>'task_id')::uuid;

  IF _mode = 'sent' THEN
    UPDATE public.tasks
    SET notified_at = now(), vendor_status = 'notified', updated_at = now(), updated_by = _uid
    WHERE id = _task_id AND user_id = _uid AND deleted_at IS NULL;

    INSERT INTO public.notifications (user_id, type, channel, task_id, email_to, phone_to, subject, status, provider_message_id)
    VALUES (_uid, 'vendor_cleaning_notify', _channel, _task_id,
            CASE WHEN _channel = 'email' THEN _to_address END,
            CASE WHEN _channel = 'whatsapp' THEN _to_address END,
            'Notify vendor: ' || (_action.payload->>'service_type'),
            'sent', _provider_message_id);

    INSERT INTO public.events (user_id, entity_type, entity_id, action, metadata)
    VALUES (_uid, 'task', _task_id, 'vendor_notified',
            jsonb_build_object('channel', _channel, 'to', _to_address,
              'provider_message_id', _provider_message_id,
              'agent_action_id', _action_id, 'extra', _extra));

    _result := jsonb_build_object('task_id', _task_id, 'channel', _channel,
      'provider_message_id', _provider_message_id) || _extra;
    UPDATE public.agent_actions SET status='executed', result=_result, executed_at=now(),
      executed_by=_uid, approved_at=COALESCE(approved_at,now()), approved_by=COALESCE(approved_by,_uid)
    WHERE id = _action_id;
    RETURN jsonb_build_object('ok', true, 'mode','sent', 'result', _result);

  ELSIF _mode = 'failed' THEN
    UPDATE public.agent_actions SET status='failed',
      error_message = COALESCE(_error_message,'send_failed'), updated_at=now()
    WHERE id = _action_id;
    INSERT INTO public.notifications (user_id, type, channel, task_id, subject, status, error)
    VALUES (_uid, 'vendor_notify_failed', 'push', _task_id,
            'Falla al notificar vendor', 'failed', _error_message);
    INSERT INTO public.events (user_id, entity_type, entity_id, action, metadata)
    VALUES (_uid, 'agent_action', _action_id, 'failed',
            jsonb_build_object('source','cleaning-notify-vendor',
              'error', _error_message, 'extra', _extra));
    RETURN jsonb_build_object('ok', false, 'mode','failed', 'error', _error_message);

  ELSIF _mode = 'skipped' THEN
    -- Skipped without channel: vendor missing email AND whatsapp_phone, or vendor unassigned.
    UPDATE public.agent_actions SET status='failed',
      error_message = COALESCE(_error_message,'no_channel_available'), updated_at=now()
    WHERE id = _action_id;
    INSERT INTO public.notifications (user_id, type, channel, task_id, subject, status, error)
    VALUES (_uid, 'vendor_notify_skipped', 'push', _task_id,
            'Vendor sin canal configurado', 'failed',
            COALESCE(_error_message,'no_channel_available'));
    INSERT INTO public.events (user_id, entity_type, entity_id, action, metadata)
    VALUES (_uid, 'agent_action', _action_id, 'failed',
            jsonb_build_object('source','cleaning-notify-vendor','reason','skipped',
              'error', _error_message, 'extra', _extra));
    RETURN jsonb_build_object('ok', false, 'mode','skipped', 'reason', _error_message);
  ELSE
    RAISE EXCEPTION 'invalid_mode: %', _mode USING ERRCODE='22023';
  END IF;
END;
$function$;

-- =====================================================================
-- 10. enqueue_escalate_no_response — called by escalate cron edge fn
-- =====================================================================
CREATE OR REPLACE FUNCTION public.enqueue_escalate_no_response()
RETURNS TABLE(action_id uuid, task_id uuid, reason text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _row record; _aa_id uuid; _idem text; _hours int; _reason text;
BEGIN
  FOR _row IN
    SELECT t.id AS task_id, t.user_id, t.vendor_status, r.check_in_date
    FROM public.tasks t
    JOIN public.missions m ON m.id = t.mission_id
    JOIN public.reservations r ON r.mission_id = m.id
    WHERE t.title LIKE 'Coordinar limpieza pre-checkin%'
      AND t.vendor_status IN ('assigned','notified')
      AND t.confirmed_at IS NULL
      AND t.escalated_at IS NULL
      AND t.deleted_at IS NULL
      AND r.deleted_at IS NULL
      AND r.status = 'confirmed'
      AND r.check_in_date IS NOT NULL
      AND r.check_in_date <= (now() + INTERVAL '24 hours')::date
  LOOP
    _hours := GREATEST(0, EXTRACT(EPOCH FROM ((_row.check_in_date::timestamptz) - now()))::int / 3600);
    _reason := CASE _row.vendor_status WHEN 'assigned' THEN 'never_notified' ELSE 'no_response' END;
    _idem := 'cleaning:escalate:' || _row.task_id::text || ':' || _row.check_in_date::text;

    INSERT INTO public.agent_actions (
      user_id, source_type, source_ref, agent_name, action_type, payload,
      requires_approval, idempotency_key, status, confidence_score
    ) VALUES (
      _row.user_id, 'system', _row.task_id::text, 'cleaning_coordinator',
      'escalate_vendor_no_response',
      jsonb_build_object('task_id', _row.task_id, 'hours_until_checkin', _hours, 'reason', _reason),
      false, _idem, 'proposed', 1.0
    )
    ON CONFLICT (user_id, idempotency_key) DO NOTHING
    RETURNING id INTO _aa_id;

    IF _aa_id IS NOT NULL THEN
      action_id := _aa_id; task_id := _row.task_id; reason := _reason;
      RETURN NEXT;
    END IF;
  END LOOP;
  RETURN;
END;
$function$;

-- =====================================================================
-- 11. dispatcher helper: pick due notify_vendor_cleaning actions
-- =====================================================================
CREATE OR REPLACE FUNCTION public.pick_scheduled_notify_actions(_limit int DEFAULT 50)
RETURNS TABLE(action_id uuid, user_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT id, user_id FROM public.agent_actions
  WHERE status = 'proposed'
    AND requires_approval = false
    AND scheduled_for IS NOT NULL
    AND scheduled_for <= now()
    AND action_type = 'notify_vendor_cleaning'
  ORDER BY scheduled_for ASC
  LIMIT _limit;
$function$;
