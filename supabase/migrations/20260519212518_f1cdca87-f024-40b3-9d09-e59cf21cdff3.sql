
-- =============================================================================
-- PASO 1 — pgvector + tablas core
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.maintenance_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE RESTRICT,
  asset_id uuid NULL REFERENCES public.assets(id) ON DELETE RESTRICT,
  title text NOT NULL,
  description text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','diagnosing','in_progress','resolved','closed')),
  resolution_notes text NULL,
  vendor_contact_id uuid NULL REFERENCES public.contacts(id) ON DELETE SET NULL,
  cost_amount numeric(10,2) NULL,
  cost_currency text NULL DEFAULT 'USD',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz NULL,
  embedding vector(1536) NULL,
  agent_action_id uuid NULL REFERENCES public.agent_actions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL,
  updated_by uuid NULL,
  deleted_at timestamptz NULL,
  deleted_by uuid NULL,
  CONSTRAINT maintenance_incidents_resolution_consistency CHECK (
    (status IN ('resolved','closed') AND resolved_at IS NOT NULL)
    OR (status NOT IN ('resolved','closed'))
  )
);

CREATE INDEX IF NOT EXISTS idx_maintenance_incidents_user_id ON public.maintenance_incidents(user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_maintenance_incidents_property_id ON public.maintenance_incidents(property_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_maintenance_incidents_asset_id ON public.maintenance_incidents(asset_id) WHERE deleted_at IS NULL AND asset_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_maintenance_incidents_status ON public.maintenance_incidents(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_maintenance_incidents_occurred_at ON public.maintenance_incidents(occurred_at DESC) WHERE deleted_at IS NULL;

CREATE TRIGGER set_user_id_on_insert_maintenance_incidents
  BEFORE INSERT ON public.maintenance_incidents
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id_on_insert();
CREATE TRIGGER set_updated_at_maintenance_incidents
  BEFORE UPDATE ON public.maintenance_incidents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER audit_change_maintenance_incidents
  AFTER INSERT OR UPDATE OR DELETE ON public.maintenance_incidents
  FOR EACH ROW EXECUTE FUNCTION public.audit_change();

CREATE TABLE IF NOT EXISTS public.incident_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  incident_id uuid NOT NULL REFERENCES public.maintenance_incidents(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  filename text NOT NULL,
  mime_type text NULL,
  file_size_bytes bigint NULL,
  caption text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL,
  updated_by uuid NULL,
  deleted_at timestamptz NULL,
  deleted_by uuid NULL
);

CREATE INDEX IF NOT EXISTS idx_incident_attachments_incident_id ON public.incident_attachments(incident_id) WHERE deleted_at IS NULL;

CREATE TRIGGER set_user_id_on_insert_incident_attachments
  BEFORE INSERT ON public.incident_attachments
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id_on_insert();
CREATE TRIGGER set_updated_at_incident_attachments
  BEFORE UPDATE ON public.incident_attachments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER audit_change_incident_attachments
  AFTER INSERT OR UPDATE OR DELETE ON public.incident_attachments
  FOR EACH ROW EXECUTE FUNCTION public.audit_change();

-- =============================================================================
-- PASO 2 — extender CHECKs + RLS
-- =============================================================================
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_entity_type_check;
ALTER TABLE public.events ADD CONSTRAINT events_entity_type_check
  CHECK (entity_type = ANY (ARRAY[
    'task','mission','area','attachment','contact','profile','agent_action',
    'reservation','property','vendor','asset','email_ingestion','mission_template',
    'property_vendor_assignment','property_vendor_assignments',
    'maintenance_incident','incident_attachment'
  ]));

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_action_check;
ALTER TABLE public.events ADD CONSTRAINT events_action_check
  CHECK (action = ANY (ARRAY[
    'created','updated','completed','due_changed','status_changed','deleted','restored',
    'executed','approved','rejected','failed','cancelled',
    'calendar_event_created','calendar_event_updated','calendar_event_deleted','calendar_event_skipped',
    'vendor_assigned','vendor_notified','vendor_confirmed','vendor_escalated','vendor_unassigned',
    'incident_created','incident_updated','incident_resolved','incident_closed','incident_reopened',
    'task_auto_created'
  ]));

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY[
    'digest','alert','overdue',
    'vendor_cleaning_notify','vendor_notify_failed','vendor_notify_skipped','vendor_escalation',
    'maintenance_alert'
  ]));

ALTER TABLE public.maintenance_incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "maintenance_incidents_select" ON public.maintenance_incidents
  FOR SELECT TO authenticated USING (auth.uid() = user_id AND deleted_at IS NULL);
CREATE POLICY "maintenance_incidents_select_trash" ON public.maintenance_incidents
  FOR SELECT TO authenticated USING (auth.uid() = user_id AND deleted_at IS NOT NULL);
CREATE POLICY "maintenance_incidents_insert" ON public.maintenance_incidents
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "maintenance_incidents_update" ON public.maintenance_incidents
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "maintenance_incidents_delete" ON public.maintenance_incidents
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

ALTER TABLE public.incident_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "incident_attachments_select" ON public.incident_attachments
  FOR SELECT TO authenticated USING (auth.uid() = user_id AND deleted_at IS NULL);
CREATE POLICY "incident_attachments_insert" ON public.incident_attachments
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "incident_attachments_update" ON public.incident_attachments
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "incident_attachments_delete" ON public.incident_attachments
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- =============================================================================
-- PASO 3 — seed assets Vista Pelícano
-- =============================================================================
INSERT INTO public.assets (user_id, property_id, name, category, notes, created_by)
VALUES
  ('1d71c262-7c8a-4a1f-84ef-1120f02d3321','ba09bfbe-4c4f-4d96-962b-1a14ef23f732','AC Cuarto Principal','hvac','Unidad mini-split. Filtro debe limpiarse periódicamente.','1d71c262-7c8a-4a1f-84ef-1120f02d3321'),
  ('1d71c262-7c8a-4a1f-84ef-1120f02d3321','ba09bfbe-4c4f-4d96-962b-1a14ef23f732','AC Sala','hvac','Unidad mini-split sala/comedor.','1d71c262-7c8a-4a1f-84ef-1120f02d3321'),
  ('1d71c262-7c8a-4a1f-84ef-1120f02d3321','ba09bfbe-4c4f-4d96-962b-1a14ef23f732','Refrigerador','appliance','Cocina principal.','1d71c262-7c8a-4a1f-84ef-1120f02d3321'),
  ('1d71c262-7c8a-4a1f-84ef-1120f02d3321','ba09bfbe-4c4f-4d96-962b-1a14ef23f732','Cerradura Smart Puerta Principal','security','Acceso huéspedes via código. Verificar baterías mensualmente.','1d71c262-7c8a-4a1f-84ef-1120f02d3321'),
  ('1d71c262-7c8a-4a1f-84ef-1120f02d3321','ba09bfbe-4c4f-4d96-962b-1a14ef23f732','Calentador de Agua','plumbing','Verificar presión y temperatura.','1d71c262-7c8a-4a1f-84ef-1120f02d3321');

-- =============================================================================
-- PASO 4 — RPCs
-- =============================================================================
CREATE OR REPLACE FUNCTION public.find_similar_incidents(
  _query_embedding vector(1536),
  _property_id uuid,
  _limit int DEFAULT 5
)
RETURNS TABLE (
  id uuid, title text, description text, severity text, status text,
  resolution_notes text, asset_id uuid, asset_name text,
  vendor_contact_id uuid, vendor_name text, cost_amount numeric,
  occurred_at timestamptz, resolved_at timestamptz, similarity float
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT mi.id, mi.title, mi.description, mi.severity, mi.status, mi.resolution_notes,
    mi.asset_id, a.name AS asset_name, mi.vendor_contact_id, c.name AS vendor_name,
    mi.cost_amount, mi.occurred_at, mi.resolved_at,
    1 - (mi.embedding <=> _query_embedding) AS similarity
  FROM public.maintenance_incidents mi
  LEFT JOIN public.assets a ON a.id = mi.asset_id
  LEFT JOIN public.contacts c ON c.id = mi.vendor_contact_id
  WHERE mi.user_id = auth.uid()
    AND mi.property_id = _property_id
    AND mi.deleted_at IS NULL
    AND mi.embedding IS NOT NULL
  ORDER BY mi.embedding <=> _query_embedding ASC
  LIMIT _limit;
$$;

GRANT EXECUTE ON FUNCTION public.find_similar_incidents(vector, uuid, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.enqueue_maintenance_task_for_incident(_incident_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  _incident record;
  _action_id uuid;
  _idem text;
BEGIN
  SELECT * INTO _incident FROM public.maintenance_incidents
   WHERE id = _incident_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF _incident.severity NOT IN ('high','critical') THEN RETURN NULL; END IF;
  IF _incident.status NOT IN ('open','diagnosing','in_progress') THEN RETURN NULL; END IF;

  _idem := 'maintenance_task:' || _incident_id::text;

  INSERT INTO public.agent_actions (
    user_id, source_type, source_ref, agent_name, action_type, payload,
    status, requires_approval, idempotency_key, confidence_score
  ) VALUES (
    _incident.user_id, 'system', _incident_id::text, 'maintenance_memory',
    'create_maintenance_task',
    jsonb_build_object(
      'incident_id', _incident_id,
      'property_id', _incident.property_id,
      'asset_id', _incident.asset_id,
      'title', 'Resolver: ' || _incident.title,
      'severity', _incident.severity,
      'description', _incident.description
    ),
    'proposed', false, _idem, 1.0
  )
  ON CONFLICT (user_id, idempotency_key) WHERE (idempotency_key IS NOT NULL)
  DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()
  RETURNING id INTO _action_id;

  RETURN _action_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.enqueue_maintenance_task_for_incident(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.maintenance_incident_severity_trigger()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.severity IN ('high','critical')) THEN
    PERFORM public.enqueue_maintenance_task_for_incident(NEW.id);
  ELSIF (TG_OP = 'UPDATE'
         AND NEW.severity IN ('high','critical')
         AND COALESCE(OLD.severity,'') NOT IN ('high','critical')) THEN
    PERFORM public.enqueue_maintenance_task_for_incident(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER maintenance_incident_severity_auto_task
  AFTER INSERT OR UPDATE ON public.maintenance_incidents
  FOR EACH ROW EXECUTE FUNCTION public.maintenance_incident_severity_trigger();

-- =============================================================================
-- 4.4 Service function que crea task de mantenimiento atómicamente
-- =============================================================================
CREATE OR REPLACE FUNCTION public.execute_create_maintenance_task_service(_action_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  _action record; _payload jsonb; _uid uuid;
  _incident_id uuid; _property_id uuid; _asset_id uuid;
  _title text; _severity text; _description text;
  _vendor_contact_id uuid;
  _mission_id uuid; _now timestamptz := now();
  _today date := (_now AT TIME ZONE 'America/Puerto_Rico')::date;
  _due date; _is_today boolean;
  _task_id uuid; _result jsonb; _asset_name text;
  _area_id uuid;
BEGIN
  SELECT * INTO _action FROM public.agent_actions WHERE id = _action_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'action_not_found' USING ERRCODE='42501'; END IF;
  IF _action.action_type <> 'create_maintenance_task' THEN
    RAISE EXCEPTION 'wrong_action_type: %', _action.action_type USING ERRCODE='22023';
  END IF;
  IF _action.status = 'executed' THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'result', _action.result);
  END IF;
  IF _action.status NOT IN ('proposed','approved') THEN
    RAISE EXCEPTION 'invalid_state: %', _action.status USING ERRCODE='22023';
  END IF;

  BEGIN
    _uid := _action.user_id;
    _payload := COALESCE(_action.payload, '{}'::jsonb);
    _incident_id := (_payload->>'incident_id')::uuid;
    _property_id := (_payload->>'property_id')::uuid;
    _asset_id := NULLIF(_payload->>'asset_id','')::uuid;
    _title := _payload->>'title';
    _severity := _payload->>'severity';
    _description := _payload->>'description';

    IF _incident_id IS NULL OR _property_id IS NULL OR _title IS NULL OR _severity IS NULL THEN
      RAISE EXCEPTION 'invalid_payload: incident_id, property_id, title, severity required' USING ERRCODE='22023';
    END IF;

    IF _asset_id IS NOT NULL THEN
      SELECT name INTO _asset_name FROM public.assets WHERE id = _asset_id;
    END IF;

    -- Vendor primary maintenance
    SELECT pva.contact_id INTO _vendor_contact_id
    FROM public.property_vendor_assignments pva
    WHERE pva.property_id = _property_id
      AND pva.vendor_category = 'vendor_maintenance'
      AND pva.is_primary = true
      AND pva.deleted_at IS NULL
      AND pva.user_id = _uid
    LIMIT 1;

    -- Mission activa por reservation actual; fallback: mission standalone
    SELECT r.mission_id INTO _mission_id
    FROM public.reservations r
    WHERE r.user_id = _uid
      AND r.property_id = _property_id
      AND r.deleted_at IS NULL
      AND r.status = 'confirmed'
      AND r.mission_id IS NOT NULL
      AND _today BETWEEN r.check_in_date AND r.check_out_date
    ORDER BY r.check_in_date DESC LIMIT 1;

    IF _mission_id IS NULL THEN
      SELECT default_area_id INTO _area_id FROM public.properties WHERE id = _property_id;
      INSERT INTO public.missions (user_id, area_id, title, priority, due_date, agent_action_id)
      VALUES (_uid, _area_id,
              'Mantenimiento — ' || COALESCE(_asset_name, _title),
              CASE WHEN _severity = 'critical' THEN 'high' ELSE 'mid' END,
              _today + (CASE WHEN _severity='critical' THEN 1 ELSE 3 END),
              _action_id)
      RETURNING id INTO _mission_id;
    END IF;

    _due := _today + (CASE WHEN _severity='critical' THEN 1 ELSE 3 END);
    _is_today := (_severity = 'critical');

    INSERT INTO public.tasks (
      user_id, mission_id, title, notes, due_date,
      friction_level, is_today, assignee_contact_id, agent_action_id
    ) VALUES (
      _uid, _mission_id, _title, _description, _due,
      3, _is_today, _vendor_contact_id, _action_id
    ) RETURNING id INTO _task_id;

    UPDATE public.maintenance_incidents
    SET agent_action_id = _action_id, updated_at = now(), updated_by = _uid
    WHERE id = _incident_id AND user_id = _uid;

    _result := jsonb_build_object(
      'task_id', _task_id,
      'mission_id', _mission_id,
      'vendor_contact_id', _vendor_contact_id,
      'incident_id', _incident_id,
      'due_date', _due,
      'is_today', _is_today
    );

    UPDATE public.agent_actions
    SET status='executed', result=_result, executed_at=now(),
        executed_by=_uid, approved_at=COALESCE(approved_at,now()), approved_by=COALESCE(approved_by,_uid)
    WHERE id = _action_id;

    INSERT INTO public.events (user_id, entity_type, entity_id, action, metadata)
    VALUES (_uid, 'maintenance_incident', _incident_id, 'task_auto_created',
            jsonb_build_object('agent_action_id', _action_id, 'task_id', _task_id,
                               'mission_id', _mission_id, 'severity', _severity,
                               'vendor_contact_id', _vendor_contact_id));

    INSERT INTO public.events (user_id, entity_type, entity_id, action, metadata)
    VALUES (_uid, 'agent_action', _action_id, 'executed',
            jsonb_build_object('source','execute_create_maintenance_task_service',
                               'action_type','create_maintenance_task', 'result', _result));

    RETURN jsonb_build_object('ok', true, 'action_id', _action_id, 'result', _result);
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.agent_actions
    SET status='failed', error_message=SQLERRM, updated_at=now()
    WHERE id = _action_id;
    RAISE;
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.execute_create_maintenance_task_service(uuid) TO authenticated;

-- =============================================================================
-- Auto-dispatch: trigger on agent_actions that calls the service when an
-- auto-enqueued (requires_approval=false) create_maintenance_task is inserted.
-- This mirrors the cleaning pattern (auto-execute when no approval needed).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.auto_execute_maintenance_task()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.action_type = 'create_maintenance_task'
     AND NEW.requires_approval = false
     AND NEW.status = 'proposed' THEN
    BEGIN
      PERFORM public.execute_create_maintenance_task_service(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      -- The service function already marks the action as failed; swallow to not
      -- block the enqueue path. The failed status is what surfaces the error.
      NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER auto_execute_maintenance_task_trigger
  AFTER INSERT ON public.agent_actions
  FOR EACH ROW EXECUTE FUNCTION public.auto_execute_maintenance_task();
