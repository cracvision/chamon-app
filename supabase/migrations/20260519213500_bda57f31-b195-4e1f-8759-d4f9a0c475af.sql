
ALTER TABLE public.maintenance_incidents DISABLE TRIGGER audit_change_maintenance_incidents;
ALTER TABLE public.tasks DISABLE TRIGGER trg_tasks_audit;
ALTER TABLE public.missions DISABLE TRIGGER trg_missions_audit;
ALTER TABLE public.agent_actions DISABLE TRIGGER trg_agent_actions_audit;

WITH test_incidents AS (SELECT id FROM public.maintenance_incidents WHERE title LIKE 'TEST_%'),
     test_actions   AS (SELECT id FROM public.agent_actions WHERE payload->>'title' LIKE 'Resolver: TEST_%'),
     test_tasks     AS (SELECT id FROM public.tasks WHERE title LIKE 'Resolver: TEST_%'),
     test_missions  AS (SELECT id FROM public.missions WHERE title LIKE 'Mantenimiento — TEST_%')
DELETE FROM public.events
 WHERE entity_id IN (SELECT id FROM test_incidents)
    OR entity_id IN (SELECT id FROM test_actions)
    OR entity_id IN (SELECT id FROM test_tasks)
    OR entity_id IN (SELECT id FROM test_missions);

DELETE FROM public.tasks WHERE title LIKE 'Resolver: TEST_%';
DELETE FROM public.missions WHERE title LIKE 'Mantenimiento — TEST_%';
DELETE FROM public.agent_actions WHERE payload->>'title' LIKE 'Resolver: TEST_%';
DELETE FROM public.maintenance_incidents WHERE title LIKE 'TEST_%';

ALTER TABLE public.maintenance_incidents ENABLE TRIGGER audit_change_maintenance_incidents;
ALTER TABLE public.tasks ENABLE TRIGGER trg_tasks_audit;
ALTER TABLE public.missions ENABLE TRIGGER trg_missions_audit;
ALTER TABLE public.agent_actions ENABLE TRIGGER trg_agent_actions_audit;
