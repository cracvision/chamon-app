
DO $$
DECLARE
  _reservation_id uuid := '13e2585f-a547-4893-afbc-9af286304a7e';
  _mission_id uuid := '4c104e6c-1400-461f-8dec-3ae10fb96e87';
  _create_action_id uuid := '070c334e-11f4-4eed-ae5d-8b09573995cb';
  _cancel_action_id uuid := 'a864429b-b923-4e8e-9a2a-6a0c95ffa5ac';
BEGIN
  -- 1. Events that reference any of these entities
  DELETE FROM public.events
  WHERE entity_id IN (_reservation_id, _mission_id, _create_action_id, _cancel_action_id)
     OR entity_id IN (SELECT id FROM public.tasks WHERE mission_id = _mission_id);

  -- 2. Tasks of the mission
  DELETE FROM public.tasks WHERE mission_id = _mission_id;

  -- 3. Reservation (must go before mission to avoid FK if any, and to clear references)
  DELETE FROM public.reservations WHERE id = _reservation_id;

  -- 4. Mission
  DELETE FROM public.missions WHERE id = _mission_id;

  -- 5. Agent actions
  DELETE FROM public.agent_actions WHERE id IN (_create_action_id, _cancel_action_id);

  -- 6. Final sweep of any audit events created by the deletes above
  DELETE FROM public.events
  WHERE entity_id IN (_reservation_id, _mission_id, _create_action_id, _cancel_action_id);
END $$;
