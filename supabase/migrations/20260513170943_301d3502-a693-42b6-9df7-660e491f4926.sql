
-- Service-role-callable executor for escalate_vendor_no_response actions.
-- Mirrors the branch in execute_agent_action() but uses _action.user_id
-- instead of auth.uid() so the cron edge function (service role) can invoke it.
CREATE OR REPLACE FUNCTION public.execute_escalate_action_service(_action_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _action record; _payload jsonb; _task_id uuid; _task record; _result jsonb;
  _uid uuid;
BEGIN
  SELECT * INTO _action FROM public.agent_actions WHERE id = _action_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'action_not_found' USING ERRCODE='42501'; END IF;
  IF _action.action_type <> 'escalate_vendor_no_response' THEN
    RAISE EXCEPTION 'wrong_action_type: %', _action.action_type USING ERRCODE='22023';
  END IF;
  IF _action.status = 'executed' THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'result', _action.result);
  END IF;
  IF _action.status NOT IN ('proposed','approved') THEN
    RAISE EXCEPTION 'invalid_state: %', _action.status USING ERRCODE='22023';
  END IF;

  _uid := _action.user_id;
  _payload := COALESCE(_action.payload, '{}'::jsonb);
  _task_id := (_payload->>'task_id')::uuid;
  IF _task_id IS NULL THEN
    RAISE EXCEPTION 'missing_task_id' USING ERRCODE='22023';
  END IF;

  SELECT t.id, t.mission_id, t.title, t.vendor_status, t.assignee_contact_id, c.name AS vendor_name
  INTO _task
  FROM public.tasks t LEFT JOIN public.contacts c ON c.id = t.assignee_contact_id
  WHERE t.id = _task_id AND t.user_id = _uid AND t.deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'task_not_found_or_forbidden' USING ERRCODE='42501'; END IF;

  UPDATE public.tasks SET escalated_at = now(), vendor_status = 'escalated',
    updated_at = now(), updated_by = _uid
  WHERE id = _task_id AND user_id = _uid;

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
            'agent_action_id', _action.id,
            'source', 'escalate-cleaning-check'));

  _result := jsonb_build_object('task_id', _task_id, 'previous_vendor_status', _task.vendor_status);

  UPDATE public.agent_actions SET status='executed', result=_result, executed_at=now(),
    executed_by=_uid, approved_at=COALESCE(approved_at, now()), approved_by=COALESCE(approved_by, _uid)
  WHERE id = _action.id;

  INSERT INTO public.events (user_id, entity_type, entity_id, action, metadata)
  VALUES (_uid, 'agent_action', _action.id, 'executed',
          jsonb_build_object('source','execute_escalate_action_service','action_type', _action.action_type,
            'result', _result));

  RETURN jsonb_build_object('ok', true, 'action_id', _action.id, 'result', _result);
END;
$function$;
