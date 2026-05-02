CREATE UNIQUE INDEX IF NOT EXISTS missions_user_code_active_unique
  ON public.missions (user_id, code)
  WHERE deleted_at IS NULL;