
-- ============ PROPERTIES ============
CREATE TABLE public.properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  code text,
  address text,
  timezone text NOT NULL DEFAULT 'America/Puerto_Rico',
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
CREATE POLICY properties_select_own ON public.properties FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY properties_insert_own ON public.properties FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY properties_update_own ON public.properties FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY properties_delete_own ON public.properties FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER properties_set_updated_at BEFORE UPDATE ON public.properties FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER properties_set_user_id BEFORE INSERT ON public.properties FOR EACH ROW EXECUTE FUNCTION public.set_user_id_on_insert();

-- ============ RESERVATIONS ============
CREATE TABLE public.reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'manual', -- airbnb|vrbo|booking|manual|email_detected
  confirmation_code text,
  guest_name text,
  guest_email text,
  guest_phone text,
  check_in_date date,
  check_out_date date,
  check_in_time time,
  check_out_time time,
  number_of_guests int,
  payout_amount numeric(12,2),
  cleaning_fee numeric(12,2),
  taxes_or_fees numeric(12,2),
  status text NOT NULL DEFAULT 'detected', -- detected|confirmed|cancelled|completed
  confidence_score real,
  source_email_ids text[],
  calendar_event_id text,
  mission_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX reservations_unique_source_code
  ON public.reservations (user_id, source, confirmation_code)
  WHERE confirmation_code IS NOT NULL;
CREATE INDEX reservations_property_idx ON public.reservations(property_id);
CREATE INDEX reservations_dates_idx ON public.reservations(check_in_date, check_out_date);
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY reservations_select_own ON public.reservations FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY reservations_insert_own ON public.reservations FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY reservations_update_own ON public.reservations FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY reservations_delete_own ON public.reservations FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER reservations_set_updated_at BEFORE UPDATE ON public.reservations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER reservations_set_user_id BEFORE INSERT ON public.reservations FOR EACH ROW EXECUTE FUNCTION public.set_user_id_on_insert();

-- ============ AGENT ACTIONS ============
CREATE TABLE public.agent_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  source_type text NOT NULL,           -- email|attachment|voice|schedule|manual|reservation
  source_ref text,
  agent_name text,                     -- inbox|reservation|calendar|task_planner|document|maintenance|finance|briefing|audit
  action_type text NOT NULL,           -- create_reservation|create_calendar_event|create_task|update_task|create_mission|draft_email|send_email|update_reservation|...
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence_score real,
  status text NOT NULL DEFAULT 'proposed', -- proposed|approved|rejected|executed|failed
  requires_approval boolean NOT NULL DEFAULT true,
  idempotency_key text,
  group_key text,                      -- agrupa propuestas del mismo trigger (ej. una reserva)
  result jsonb,
  error_message text,
  approved_by uuid,
  approved_at timestamptz,
  executed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX agent_actions_idempotency_key_unique
  ON public.agent_actions (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX agent_actions_status_idx ON public.agent_actions(user_id, status, created_at DESC);
CREATE INDEX agent_actions_group_idx ON public.agent_actions(user_id, group_key);
ALTER TABLE public.agent_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY agent_actions_select_own ON public.agent_actions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY agent_actions_insert_own ON public.agent_actions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY agent_actions_update_own ON public.agent_actions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY agent_actions_delete_own ON public.agent_actions FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER agent_actions_set_updated_at BEFORE UPDATE ON public.agent_actions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER agent_actions_set_user_id BEFORE INSERT ON public.agent_actions FOR EACH ROW EXECUTE FUNCTION public.set_user_id_on_insert();

-- ============ EMAIL INGESTION LOG ============
CREATE TABLE public.email_ingestion_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  gmail_message_id text NOT NULL,
  gmail_thread_id text,
  from_address text,
  subject text,
  received_at timestamptz,
  classification text,                  -- reservation_candidate|guest_message|invoice|payout|other
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  reservation_id uuid REFERENCES public.reservations(id) ON DELETE SET NULL,
  extracted_payload jsonb,
  confidence_score real,
  processed_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX email_ingestion_log_unique_msg
  ON public.email_ingestion_log (user_id, gmail_message_id);
ALTER TABLE public.email_ingestion_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY email_ingestion_select_own ON public.email_ingestion_log FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY email_ingestion_insert_own ON public.email_ingestion_log FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY email_ingestion_update_own ON public.email_ingestion_log FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER email_ingestion_set_user_id BEFORE INSERT ON public.email_ingestion_log FOR EACH ROW EXECUTE FUNCTION public.set_user_id_on_insert();

-- ============ VENDORS ============
CREATE TABLE public.vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  name text NOT NULL,
  category text,                       -- cleaning|maintenance|plumber|electrician|appliance|pest|other
  phone text,
  email text,
  rating int,
  last_service_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY vendors_select_own ON public.vendors FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY vendors_insert_own ON public.vendors FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY vendors_update_own ON public.vendors FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY vendors_delete_own ON public.vendors FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER vendors_set_updated_at BEFORE UPDATE ON public.vendors FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER vendors_set_user_id BEFORE INSERT ON public.vendors FOR EACH ROW EXECUTE FUNCTION public.set_user_id_on_insert();

-- ============ ASSETS ============
CREATE TABLE public.assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text,                       -- appliance|hvac|lock|plumbing|electrical|furniture|electronics|other
  brand text,
  model text,
  serial_number text,
  purchase_date date,
  warranty_expires_at date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY assets_select_own ON public.assets FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY assets_insert_own ON public.assets FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY assets_update_own ON public.assets FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY assets_delete_own ON public.assets FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER assets_set_updated_at BEFORE UPDATE ON public.assets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER assets_set_user_id BEFORE INSERT ON public.assets FOR EACH ROW EXECUTE FUNCTION public.set_user_id_on_insert();

-- ============ EXTEND ATTACHMENTS ============
ALTER TABLE public.attachments
  ADD COLUMN IF NOT EXISTS extracted_data jsonb,
  ADD COLUMN IF NOT EXISTS asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL;
