ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_entity_type_check;
ALTER TABLE public.events ADD CONSTRAINT events_entity_type_check
  CHECK (entity_type IN (
    'task','mission','area','attachment','contact','profile',
    'agent_action','reservation','property','vendor','asset','email_ingestion'
  ));

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_action_check;
ALTER TABLE public.events ADD CONSTRAINT events_action_check
  CHECK (action IN (
    'created','updated','completed','due_changed','status_changed',
    'deleted','restored','executed','approved','rejected','failed'
  ));