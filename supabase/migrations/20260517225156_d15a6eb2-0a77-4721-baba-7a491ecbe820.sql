
DO $$
BEGIN
  -- Disable audit triggers during cleanup (they don't handle DELETE)
  ALTER TABLE public.property_vendor_assignments DISABLE TRIGGER USER;
  ALTER TABLE public.tasks DISABLE TRIGGER USER;
  ALTER TABLE public.missions DISABLE TRIGGER USER;
  ALTER TABLE public.reservations DISABLE TRIGGER USER;
  ALTER TABLE public.agent_actions DISABLE TRIGGER USER;
  ALTER TABLE public.contacts DISABLE TRIGGER USER;

  DELETE FROM public.notifications WHERE task_id IN (SELECT id FROM public.tasks WHERE mission_id='b895b9ed-b572-4fb1-b9c0-a49ef0a53bf6');

  DELETE FROM public.events WHERE entity_id IN (
    SELECT id FROM public.tasks WHERE mission_id='b895b9ed-b572-4fb1-b9c0-a49ef0a53bf6'
    UNION SELECT 'b895b9ed-b572-4fb1-b9c0-a49ef0a53bf6'::uuid
    UNION SELECT '7727d797-05cf-4635-942b-dd11a77e348b'::uuid
    UNION SELECT unnest(ARRAY[
      'def083a7-612e-44ee-a9fd-95e168afc473','b0fcfe27-1432-4358-8c92-71c53e4271d1',
      '8c91cf57-966c-45a8-9a71-461d9d3f6a36','cc1125f5-a714-4528-816e-110c51ede4a3',
      '345838ff-4cac-4304-b595-990fd618382c','ee2b0bb0-3fda-400e-84dd-58dc63c58e25',
      '376ef038-9db5-4ade-b6d7-4165c37a780f','ce233e86-de3e-4540-8a5f-744683fc5c9c',
      'c2dddee3-ca06-4f15-859f-1f4f53aeb7df'
    ]::uuid[])
  );

  DELETE FROM public.agent_actions WHERE id = ANY(ARRAY[
    'def083a7-612e-44ee-a9fd-95e168afc473','b0fcfe27-1432-4358-8c92-71c53e4271d1',
    '8c91cf57-966c-45a8-9a71-461d9d3f6a36','cc1125f5-a714-4528-816e-110c51ede4a3',
    '345838ff-4cac-4304-b595-990fd618382c','ee2b0bb0-3fda-400e-84dd-58dc63c58e25'
  ]::uuid[]);

  DELETE FROM public.tasks WHERE mission_id='b895b9ed-b572-4fb1-b9c0-a49ef0a53bf6';
  DELETE FROM public.reservations WHERE id='7727d797-05cf-4635-942b-dd11a77e348b';
  DELETE FROM public.missions WHERE id='b895b9ed-b572-4fb1-b9c0-a49ef0a53bf6';

  DELETE FROM public.property_vendor_assignments
   WHERE id = ANY(ARRAY['376ef038-9db5-4ade-b6d7-4165c37a780f','ce233e86-de3e-4540-8a5f-744683fc5c9c']::uuid[]);

  DELETE FROM public.contacts WHERE id='c2dddee3-ca06-4f15-859f-1f4f53aeb7df';

  INSERT INTO public.property_vendor_assignments
    (user_id, property_id, contact_id, vendor_category, is_primary, created_by, updated_by)
  VALUES
    ('1d71c262-7c8a-4a1f-84ef-1120f02d3321','ba09bfbe-4c4f-4d96-962b-1a14ef23f732',
     '636720b6-8011-4d47-bbfb-3532124cc154','vendor_cleaning',true,
     '1d71c262-7c8a-4a1f-84ef-1120f02d3321','1d71c262-7c8a-4a1f-84ef-1120f02d3321');

  ALTER TABLE public.property_vendor_assignments ENABLE TRIGGER USER;
  ALTER TABLE public.tasks ENABLE TRIGGER USER;
  ALTER TABLE public.missions ENABLE TRIGGER USER;
  ALTER TABLE public.reservations ENABLE TRIGGER USER;
  ALTER TABLE public.agent_actions ENABLE TRIGGER USER;
  ALTER TABLE public.contacts ENABLE TRIGGER USER;
END $$;

-- Schedule Sprint 3.1 cron jobs (same auth pattern as gmail-sync-reservations: cron_bearer from vault)
SELECT cron.schedule(
  'dispatch-scheduled-actions',
  '*/10 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://yvfkkdvhizjdpouoewch.supabase.co/functions/v1/dispatch-scheduled-actions',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='cron_bearer')
    ),
    body := '{}'::jsonb
  );
  $cron$
);

SELECT cron.schedule(
  'escalate-cleaning-check',
  '0 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://yvfkkdvhizjdpouoewch.supabase.co/functions/v1/escalate-cleaning-check',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='cron_bearer')
    ),
    body := '{}'::jsonb
  );
  $cron$
);
