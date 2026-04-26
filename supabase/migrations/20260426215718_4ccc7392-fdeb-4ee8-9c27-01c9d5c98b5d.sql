-- Enable unaccent extension for diacritic-insensitive search
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Update chamon_search to be case + accent insensitive
CREATE OR REPLACE FUNCTION public.chamon_search(_user_id uuid, _query text, _limit integer DEFAULT 10)
 RETURNS TABLE(entity_type text, id uuid, title text, snippet text, mission_id uuid, status text, due_date date, similarity real)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  WITH q AS (
    SELECT unaccent(lower(_query)) AS norm_query
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
      similarity(unaccent(lower(m.title)), (SELECT norm_query FROM q)),
      similarity(unaccent(lower(COALESCE(m.description, ''))), (SELECT norm_query FROM q))
    ) AS similarity
  FROM public.missions m, q
  WHERE m.user_id = _user_id
    AND m.deleted_at IS NULL
    AND (
      unaccent(lower(m.title)) ILIKE '%' || q.norm_query || '%'
      OR unaccent(lower(COALESCE(m.description, ''))) ILIKE '%' || q.norm_query || '%'
      OR similarity(unaccent(lower(m.title)), q.norm_query) > 0.2
      OR similarity(unaccent(lower(COALESCE(m.description, ''))), q.norm_query) > 0.2
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
      similarity(unaccent(lower(t.title)), (SELECT norm_query FROM q)),
      similarity(unaccent(lower(COALESCE(t.notes, ''))), (SELECT norm_query FROM q))
    ) AS similarity
  FROM public.tasks t, q
  WHERE t.user_id = _user_id
    AND t.deleted_at IS NULL
    AND (
      unaccent(lower(t.title)) ILIKE '%' || q.norm_query || '%'
      OR unaccent(lower(COALESCE(t.notes, ''))) ILIKE '%' || q.norm_query || '%'
      OR similarity(unaccent(lower(t.title)), q.norm_query) > 0.2
      OR similarity(unaccent(lower(COALESCE(t.notes, ''))), q.norm_query) > 0.2
    )

  ORDER BY similarity DESC
  LIMIT _limit;
$function$;