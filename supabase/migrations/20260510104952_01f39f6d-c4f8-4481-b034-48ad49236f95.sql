
-- 1) Properties columns
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS calendar_id text,
  ADD COLUMN IF NOT EXISTS calendar_timezone text NOT NULL DEFAULT 'America/Puerto_Rico';

COMMENT ON COLUMN public.properties.calendar_id IS 'Dedicated Google Calendar ID for this property. NULL = calendar sync disabled.';
COMMENT ON COLUMN public.properties.calendar_timezone IS 'IANA timezone used when creating events (default America/Puerto_Rico).';

-- 2) Extend events.action whitelist
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_action_check;
ALTER TABLE public.events ADD CONSTRAINT events_action_check CHECK (action = ANY (ARRAY[
  'created','updated','completed','due_changed','status_changed','deleted','restored',
  'executed','approved','rejected','failed','cancelled',
  'calendar_event_created','calendar_event_updated','calendar_event_deleted','calendar_event_skipped'
]));

-- 3) Populate Vista Pelícano calendar_id
UPDATE public.properties
SET calendar_id = 'c7e1950f454dc5bee5db7832756648a722be714cccddb09d329f2dc4597b4df1@group.calendar.google.com',
    calendar_timezone = 'America/Puerto_Rico',
    updated_at = NOW()
WHERE id = 'ba09bfbe-4c4f-4d96-962b-1a14ef23f732'
  AND user_id = '1d71c262-7c8a-4a1f-84ef-1120f02d3321';

-- 4) finalize_calendar_action RPC: atomically commits the result of an HTTP call to Google
--    Called by edge function execute-calendar-action AFTER the Google API call completes.
--    SECURITY DEFINER so the edge function (running as service_role or as the user) can
--    invoke it; we still verify auth.uid() matches the action.user_id.
CREATE OR REPLACE FUNCTION public.finalize_calendar_action(
  _action_id uuid,
  _mode text,                    -- 'created' | 'updated' | 'deleted' | 'skipped' | 'failed'
  _calendar_event_id text DEFAULT NULL,
  _html_link text DEFAULT NULL,
  _skipped_reason text DEFAULT NULL,
  _error_message text DEFAULT NULL,
  _extra jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _action record;
  _reservation_id uuid;
  _result jsonb;
  _event_action text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO _action FROM public.agent_actions WHERE id = _action_id FOR UPDATE;
  IF NOT FOUND OR _action.user_id <> _uid THEN
    RAISE EXCEPTION 'not_found_or_forbidden' USING ERRCODE = '42501';
  END IF;

  IF _action.action_type NOT IN ('create_calendar_event','update_calendar_event','delete_calendar_event') THEN
    RAISE EXCEPTION 'invalid_action_type_for_finalize: %', _action.action_type USING ERRCODE = '22023';
  END IF;

  -- Idempotency: if already executed, return prior result
  IF _action.status = 'executed' THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'result', _action.result);
  END IF;

  _reservation_id := NULLIF(_action.payload->>'reservation_id','')::uuid;

  IF _mode = 'failed' THEN
    UPDATE public.agent_actions
    SET status = 'failed',
        error_message = COALESCE(_error_message, 'calendar_call_failed'),
        updated_at = now(),
        updated_by = _uid
    WHERE id = _action_id;

    INSERT INTO public.events (user_id, entity_type, entity_id, action, metadata)
    VALUES (_uid, 'agent_action', _action_id, 'failed',
            jsonb_build_object('source','execute-calendar-action','error',_error_message,'extra',_extra));
    RETURN jsonb_build_object('ok', false, 'failed', true, 'error', _error_message);
  END IF;

  -- Mutate reservation depending on mode
  IF _mode = 'created' THEN
    IF _reservation_id IS NOT NULL AND _calendar_event_id IS NOT NULL THEN
      UPDATE public.reservations
      SET calendar_event_id = _calendar_event_id,
          updated_at = now(),
          updated_by = _uid
      WHERE id = _reservation_id AND user_id = _uid AND deleted_at IS NULL;
    END IF;
    _event_action := 'calendar_event_created';
    _result := jsonb_build_object(
      'reservation_id', _reservation_id,
      'calendar_event_id', _calendar_event_id,
      'html_link', _html_link
    ) || _extra;

  ELSIF _mode = 'updated' THEN
    _event_action := 'calendar_event_updated';
    _result := jsonb_build_object(
      'reservation_id', _reservation_id,
      'calendar_event_id', _calendar_event_id,
      'html_link', _html_link
    ) || _extra;

  ELSIF _mode = 'deleted' THEN
    IF _reservation_id IS NOT NULL THEN
      UPDATE public.reservations
      SET calendar_event_id = NULL,
          updated_at = now(),
          updated_by = _uid
      WHERE id = _reservation_id AND user_id = _uid AND deleted_at IS NULL;
    END IF;
    _event_action := 'calendar_event_deleted';
    _result := jsonb_build_object(
      'reservation_id', _reservation_id,
      'former_calendar_event_id', _calendar_event_id
    ) || _extra;

  ELSIF _mode = 'skipped' THEN
    _event_action := 'calendar_event_skipped';
    _result := jsonb_build_object(
      'skipped', true,
      'reason', _skipped_reason,
      'reservation_id', _reservation_id
    ) || _extra;

  ELSE
    RAISE EXCEPTION 'invalid_mode: %', _mode USING ERRCODE = '22023';
  END IF;

  -- Mark action executed
  UPDATE public.agent_actions
  SET status = 'executed',
      result = _result,
      executed_at = now(),
      executed_by = _uid,
      approved_at = COALESCE(approved_at, now()),
      approved_by = COALESCE(approved_by, _uid)
  WHERE id = _action_id;

  -- Semantic event tied to the reservation (or the action if no reservation)
  INSERT INTO public.events (user_id, entity_type, entity_id, action, metadata)
  VALUES (_uid,
          CASE WHEN _reservation_id IS NOT NULL THEN 'reservation' ELSE 'agent_action' END,
          COALESCE(_reservation_id, _action_id),
          _event_action,
          jsonb_build_object(
            'agent_action_id', _action_id,
            'calendar_event_id', _calendar_event_id,
            'html_link', _html_link,
            'skipped_reason', _skipped_reason,
            'extra', _extra
          ));

  -- Also mirror the executed event on the action itself (consistent with other branches)
  INSERT INTO public.events (user_id, entity_type, entity_id, action, metadata)
  VALUES (_uid, 'agent_action', _action_id, 'executed',
          jsonb_build_object('source','execute-calendar-action',
                             'action_type',_action.action_type,
                             'mode',_mode,
                             'result',_result));

  RETURN jsonb_build_object('ok', true, 'action_id', _action_id, 'result', _result);
END;
$$;

-- 5) resolve_pending_reservation_id helper: lets the edge function look up the reservation_id
--    for a create_calendar_event whose payload only carries confirmation_code + check_in_date
--    (because the create_reservation_with_mission action ran moments before in the same group).
CREATE OR REPLACE FUNCTION public.resolve_pending_reservation_id(
  _confirmation_code text,
  _check_in_date date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _id uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  SELECT id INTO _id
  FROM public.reservations
  WHERE user_id = _uid
    AND confirmation_code = _confirmation_code
    AND check_in_date = _check_in_date
    AND deleted_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1;
  RETURN _id;
END;
$$;
