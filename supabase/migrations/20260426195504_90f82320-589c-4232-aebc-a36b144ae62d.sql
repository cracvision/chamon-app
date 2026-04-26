-- Enable trigram extension for fuzzy search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Trigram indexes for fast ILIKE / similarity on missions
CREATE INDEX IF NOT EXISTS missions_title_trgm_idx
  ON public.missions USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS missions_description_trgm_idx
  ON public.missions USING gin (description gin_trgm_ops);

-- Trigram indexes for fast ILIKE / similarity on tasks
CREATE INDEX IF NOT EXISTS tasks_title_trgm_idx
  ON public.tasks USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS tasks_notes_trgm_idx
  ON public.tasks USING gin (notes gin_trgm_ops);

-- Search function: returns missions + tasks matching a query for the given user.
-- Hardcodes user_id and deleted_at IS NULL filters at SQL level for safety.
CREATE OR REPLACE FUNCTION public.chamon_search(
  _user_id uuid,
  _query text,
  _limit int DEFAULT 10
)
RETURNS TABLE (
  entity_type text,
  id uuid,
  title text,
  snippet text,
  mission_id uuid,
  status text,
  due_date date,
  similarity real
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    'mission'::text AS entity_type,
    m.id,
    m.title,
    LEFT(COALESCE(m.description, ''), 200) AS snippet,
    NULL::uuid AS mission_id,
    m.status,
    m.due_date,
    GREATEST(
      similarity(m.title, _query),
      similarity(COALESCE(m.description, ''), _query)
    ) AS similarity
  FROM public.missions m
  WHERE m.user_id = _user_id
    AND m.deleted_at IS NULL
    AND (
      m.title ILIKE '%' || _query || '%'
      OR m.description ILIKE '%' || _query || '%'
      OR similarity(m.title, _query) > 0.2
    )

  UNION ALL

  SELECT
    'task'::text AS entity_type,
    t.id,
    t.title,
    LEFT(COALESCE(t.notes, ''), 200) AS snippet,
    t.mission_id,
    t.status,
    t.due_date,
    GREATEST(
      similarity(t.title, _query),
      similarity(COALESCE(t.notes, ''), _query)
    ) AS similarity
  FROM public.tasks t
  WHERE t.user_id = _user_id
    AND t.deleted_at IS NULL
    AND (
      t.title ILIKE '%' || _query || '%'
      OR t.notes ILIKE '%' || _query || '%'
      OR similarity(t.title, _query) > 0.2
    )

  ORDER BY similarity DESC
  LIMIT _limit;
$$;

-- Restrict execution: only service_role should call this (Edge Function context)
REVOKE ALL ON FUNCTION public.chamon_search(uuid, text, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.chamon_search(uuid, text, int) FROM authenticated;
REVOKE ALL ON FUNCTION public.chamon_search(uuid, text, int) FROM anon;
GRANT EXECUTE ON FUNCTION public.chamon_search(uuid, text, int) TO service_role;