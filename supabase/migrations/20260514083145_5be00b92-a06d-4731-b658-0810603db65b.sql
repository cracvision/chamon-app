CREATE OR REPLACE FUNCTION public.enqueue_escalate_no_response()
 RETURNS TABLE(action_id uuid, task_id uuid, reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _row record; _aa_id uuid; _idem text; _hours int; _reason text; _service_date date; _anchor_date date;
BEGIN
  FOR _row IN
    SELECT t.id AS task_id, t.user_id, t.vendor_status, t.title,
           r.check_in_date, r.check_out_date,
           CASE WHEN t.title LIKE 'Coordinar limpieza pre-checkin%' THEN 'pre_checkin'
                WHEN t.title LIKE 'Coordinar limpieza post-checkout%' THEN 'post_checkout'
           END AS service_type
    FROM public.tasks t
    JOIN public.missions m ON m.id = t.mission_id
    JOIN public.reservations r ON r.mission_id = m.id
    WHERE (t.title LIKE 'Coordinar limpieza pre-checkin%'
        OR t.title LIKE 'Coordinar limpieza post-checkout%')
      AND t.vendor_status IN ('assigned','notified')
      AND t.confirmed_at IS NULL
      AND t.escalated_at IS NULL
      AND t.deleted_at IS NULL
      AND r.deleted_at IS NULL
      AND r.status = 'confirmed'
      AND (
        (t.title LIKE 'Coordinar limpieza pre-checkin%'
          AND r.check_in_date IS NOT NULL
          AND r.check_in_date <= (now() + INTERVAL '24 hours')::date)
        OR
        (t.title LIKE 'Coordinar limpieza post-checkout%'
          AND r.check_out_date IS NOT NULL
          AND r.check_out_date <= (now() + INTERVAL '24 hours')::date)
      )
  LOOP
    _anchor_date := CASE _row.service_type WHEN 'pre_checkin' THEN _row.check_in_date ELSE _row.check_out_date END;
    _hours := GREATEST(0, EXTRACT(EPOCH FROM ((_anchor_date::timestamptz) - now()))::int / 3600);
    _reason := CASE _row.vendor_status WHEN 'assigned' THEN 'never_notified' ELSE 'no_response' END;
    _idem := 'cleaning:escalate:' || _row.task_id::text || ':' || _anchor_date::text;

    INSERT INTO public.agent_actions (
      user_id, source_type, source_ref, agent_name, action_type, payload,
      requires_approval, idempotency_key, status, confidence_score
    ) VALUES (
      _row.user_id, 'system', _row.task_id::text, 'cleaning_coordinator',
      'escalate_vendor_no_response',
      jsonb_build_object('task_id', _row.task_id, 'hours_until_checkin', _hours, 'reason', _reason),
      false, _idem, 'proposed', 1.0
    )
    ON CONFLICT (user_id, idempotency_key) WHERE (idempotency_key IS NOT NULL) DO NOTHING
    RETURNING id INTO _aa_id;

    IF _aa_id IS NOT NULL THEN
      action_id := _aa_id; task_id := _row.task_id; reason := _reason;
      RETURN NEXT;
    END IF;
  END LOOP;
  RETURN;
END;
$function$;