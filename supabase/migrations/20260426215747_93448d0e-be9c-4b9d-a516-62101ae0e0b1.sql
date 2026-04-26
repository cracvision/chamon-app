-- Create the dedicated extensions schema if missing
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;

-- Move extensions out of public into extensions schema
ALTER EXTENSION pg_trgm SET SCHEMA extensions;
ALTER EXTENSION unaccent SET SCHEMA extensions;

-- Recreate chamon_search with explicit search_path that includes extensions
CREATE OR REPLACE FUNCTION public.chamon_search(_user_id uuid, _query text, _limit integer DEFAULT 10)
 RETURNS TABLE(entity_type text, id uuid, title text, snippet text, mission_id uuid, status text, due_date date, similarity real)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  WITH q AS (
    SELECT extensions.unaccent(lower(_query)) AS norm_query
  )
  SELECT
    'mission'::text AS entity_type,
    m.id,
    m.title,
    LEFT(COALESCE(m.description, ''), 200) AS snippet,
    NULL::uuid AS mission_id,
    m.status,
    m.due_date,
    GREATEST(
      extensions.similarity(extensions.unaccent(lower(m.title)), (SELECT norm_query FROM q)),
      extensions.similarity(extensions.unaccent(lower(COALESCE(m.description, ''))), (SELECT norm_query FROM q))
    ) AS similarity
  FROM public.missions m, q
  WHERE m.user_id = _user_id
    AND m.deleted_at IS NULL
    AND (
      extensions.unaccent(lower(m.title)) ILIKE '%' || q.norm_query || '%'
      OR extensions.unaccent(lower(COALESCE(m.description, ''))) ILIKE '%' || q.norm_query || '%'
      OR extensions.similarity(extensions.unaccent(lower(m.title)), q.norm_query) > 0.2
      OR extensions.similarity(extensions.unaccent(lower(COALESCE(m.description, ''))), q.norm_query) > 0.2
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
      extensions.similarity(extensions.unaccent(lower(t.title)), (SELECT norm_query FROM q)),
      extensions.similarity(extensions.unaccent(lower(COALESCE(t.notes, ''))), (SELECT norm_query FROM q))
    ) AS similarity
  FROM public.tasks t, q
  WHERE t.user_id = _user_id
    AND t.deleted_at IS NULL
    AND (
      extensions.unaccent(lower(t.title)) ILIKE '%' || q.norm_query || '%'
      OR extensions.unaccent(lower(COALESCE(t.notes, ''))) ILIKE '%' || q.norm_query || '%'
      OR extensions.similarity(extensions.unaccent(lower(t.title)), q.norm_query) > 0.2
      OR extensions.similarity(extensions.unaccent(lower(COALESCE(t.notes, ''))), q.norm_query) > 0.2
    )

  ORDER BY similarity DESC
  LIMIT _limit;
$function$;