ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS agent_action_id uuid;

CREATE INDEX IF NOT EXISTS idx_reservations_agent_action_id
  ON public.reservations(agent_action_id) WHERE agent_action_id IS NOT NULL;