
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_entity_type_check;
ALTER TABLE public.events ADD CONSTRAINT events_entity_type_check
  CHECK (entity_type = ANY (ARRAY[
    'task','mission','area','attachment','contact','profile','agent_action',
    'reservation','property','vendor','asset','email_ingestion','mission_template',
    'property_vendor_assignment','property_vendor_assignments'
  ]));
