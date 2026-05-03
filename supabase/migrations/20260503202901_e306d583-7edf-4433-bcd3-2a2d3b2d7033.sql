
-- ============================================================
-- 1. Drop cost_of_inaction_weekly (legacy money-based penalty)
-- ============================================================
ALTER TABLE public.missions DROP COLUMN IF EXISTS cost_of_inaction_weekly;

-- ============================================================
-- 2. Achievements catalog
-- ============================================================
CREATE TABLE public.achievements (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL,
  icon text NOT NULL,
  criteria_type text NOT NULL,
  criteria_value integer NOT NULL DEFAULT 1,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY achievements_select_all ON public.achievements FOR SELECT TO authenticated USING (true);

-- ============================================================
-- 3. XP events (audit log of every XP delta)
-- ============================================================
CREATE TABLE public.xp_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  delta integer NOT NULL,
  reason text NOT NULL,
  task_id uuid,
  mission_id uuid,
  achievement_id text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX xp_events_user_created_idx ON public.xp_events (user_id, created_at DESC);
ALTER TABLE public.xp_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY xp_events_select_own ON public.xp_events FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- 4. User achievements (unlocked trophies + progress)
-- ============================================================
CREATE TABLE public.user_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  achievement_id text NOT NULL REFERENCES public.achievements(id) ON DELETE CASCADE,
  unlocked_at timestamptz,
  progress integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, achievement_id)
);
CREATE INDEX user_achievements_user_idx ON public.user_achievements (user_id);
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_achievements_select_own ON public.user_achievements FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- 5. User stats (cached aggregates for HUD)
-- ============================================================
CREATE TABLE public.user_stats (
  user_id uuid PRIMARY KEY,
  total_xp integer NOT NULL DEFAULT 0,
  current_level integer NOT NULL DEFAULT 1,
  level_name text NOT NULL DEFAULT 'Recluta',
  current_streak integer NOT NULL DEFAULT 0,
  longest_streak integer NOT NULL DEFAULT 0,
  last_active_date date,
  tasks_completed_total integer NOT NULL DEFAULT 0,
  missions_completed_total integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_stats_select_own ON public.user_stats FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- 6. Helpers: level lookup
-- ============================================================
CREATE OR REPLACE FUNCTION public.compute_level(_xp integer)
RETURNS TABLE (level integer, name text)
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN _xp >= 10001 THEN 5
    WHEN _xp >= 4001 THEN 4
    WHEN _xp >= 1501 THEN 3
    WHEN _xp >= 501 THEN 2
    ELSE 1
  END,
  CASE
    WHEN _xp >= 10001 THEN 'Chamón Legendario'
    WHEN _xp >= 4001 THEN 'Estratega'
    WHEN _xp >= 1501 THEN 'Comandante'
    WHEN _xp >= 501 THEN 'Operador'
    ELSE 'Recluta'
  END;
$$;

-- ============================================================
-- 7. Award XP function (writes event + updates stats)
-- ============================================================
CREATE OR REPLACE FUNCTION public.award_xp(
  _user_id uuid,
  _delta integer,
  _reason text,
  _task_id uuid DEFAULT NULL,
  _mission_id uuid DEFAULT NULL,
  _achievement_id text DEFAULT NULL,
  _metadata jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _new_total integer;
  _lvl record;
BEGIN
  IF _delta = 0 THEN RETURN; END IF;

  INSERT INTO public.xp_events (user_id, delta, reason, task_id, mission_id, achievement_id, metadata)
  VALUES (_user_id, _delta, _reason, _task_id, _mission_id, _achievement_id, _metadata);

  -- Upsert stats
  INSERT INTO public.user_stats (user_id, total_xp)
  VALUES (_user_id, GREATEST(0, _delta))
  ON CONFLICT (user_id) DO UPDATE
  SET total_xp = GREATEST(0, public.user_stats.total_xp + _delta),
      updated_at = now();

  SELECT total_xp INTO _new_total FROM public.user_stats WHERE user_id = _user_id;
  SELECT * INTO _lvl FROM public.compute_level(_new_total);
  UPDATE public.user_stats
  SET current_level = _lvl.level, level_name = _lvl.name, updated_at = now()
  WHERE user_id = _user_id;
END;
$$;

-- ============================================================
-- 8. Evaluate achievements (called after award_xp when a task/mission completes)
-- ============================================================
CREATE OR REPLACE FUNCTION public.evaluate_achievements(_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  ach record;
  _stats record;
  _val integer;
  _existing record;
BEGIN
  SELECT * INTO _stats FROM public.user_stats WHERE user_id = _user_id;
  IF NOT FOUND THEN RETURN; END IF;

  FOR ach IN SELECT * FROM public.achievements LOOP
    -- compute progress per criteria type
    _val := CASE ach.criteria_type
      WHEN 'tasks_completed' THEN _stats.tasks_completed_total
      WHEN 'missions_completed' THEN _stats.missions_completed_total
      WHEN 'streak_days' THEN _stats.current_streak
      WHEN 'total_xp' THEN _stats.total_xp
      WHEN 'early_morning_tasks' THEN
        (SELECT COUNT(*) FROM public.tasks
         WHERE user_id = _user_id AND status = 'done'
           AND completed_at IS NOT NULL
           AND EXTRACT(hour FROM completed_at AT TIME ZONE 'America/Puerto_Rico') < 9)::int
      WHEN 'overdue_resurrected' THEN
        (SELECT COUNT(*) FROM public.tasks
         WHERE user_id = _user_id AND status = 'done'
           AND due_date IS NOT NULL AND completed_at IS NOT NULL
           AND completed_at::date - due_date > 7)::int
      ELSE 0
    END;

    SELECT * INTO _existing FROM public.user_achievements
      WHERE user_id = _user_id AND achievement_id = ach.id;

    IF _existing.id IS NULL THEN
      INSERT INTO public.user_achievements (user_id, achievement_id, progress, unlocked_at)
      VALUES (_user_id, ach.id, _val,
              CASE WHEN _val >= ach.criteria_value THEN now() ELSE NULL END);
      IF _val >= ach.criteria_value THEN
        PERFORM public.award_xp(_user_id, 50, 'achievement_unlocked', NULL, NULL, ach.id);
      END IF;
    ELSIF _existing.unlocked_at IS NULL THEN
      UPDATE public.user_achievements
      SET progress = _val,
          unlocked_at = CASE WHEN _val >= ach.criteria_value THEN now() ELSE NULL END,
          updated_at = now()
      WHERE id = _existing.id;
      IF _val >= ach.criteria_value THEN
        PERFORM public.award_xp(_user_id, 50, 'achievement_unlocked', NULL, NULL, ach.id);
      END IF;
    END IF;
  END LOOP;
END;
$$;

-- ============================================================
-- 9. Task completion trigger (XP + stats + streak + achievements)
-- ============================================================
CREATE OR REPLACE FUNCTION public.task_xp_on_complete()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _base integer;
  _bonus integer := 0;
  _mission record;
  _today date := (now() AT TIME ZONE 'America/Puerto_Rico')::date;
  _stats record;
  _new_streak integer;
  _multiplier numeric := 1.0;
  _final integer;
BEGIN
  -- Only on transition to done
  IF NEW.status = 'done' AND (OLD.status IS DISTINCT FROM 'done') THEN
    _base := 10 + (COALESCE(NEW.friction_level, 2) * 5);

    SELECT priority INTO _mission FROM public.missions WHERE id = NEW.mission_id;
    IF _mission.priority = 'high' THEN _bonus := _bonus + 10;
    ELSIF _mission.priority = 'mid' THEN _bonus := _bonus + 5; END IF;

    -- Punctuality
    IF NEW.due_date IS NOT NULL THEN
      IF NEW.due_date > _today THEN _bonus := _bonus + 10;
      ELSIF NEW.due_date = _today THEN _bonus := _bonus + 5;
      END IF;
    END IF;

    -- Streak update
    SELECT * INTO _stats FROM public.user_stats WHERE user_id = NEW.user_id;
    IF _stats.user_id IS NULL THEN
      _new_streak := 1;
      INSERT INTO public.user_stats (user_id, current_streak, longest_streak, last_active_date, tasks_completed_total)
      VALUES (NEW.user_id, 1, 1, _today, 1);
    ELSE
      IF _stats.last_active_date = _today THEN
        _new_streak := _stats.current_streak;
      ELSIF _stats.last_active_date = _today - 1 THEN
        _new_streak := _stats.current_streak + 1;
      ELSE
        _new_streak := 1;
      END IF;
      UPDATE public.user_stats
      SET current_streak = _new_streak,
          longest_streak = GREATEST(longest_streak, _new_streak),
          last_active_date = _today,
          tasks_completed_total = tasks_completed_total + 1,
          updated_at = now()
      WHERE user_id = NEW.user_id;
    END IF;

    -- Streak multiplier
    IF _new_streak >= 30 THEN _multiplier := 2.0;
    ELSIF _new_streak >= 7 THEN _multiplier := 1.5;
    ELSIF _new_streak >= 3 THEN _multiplier := 1.25;
    END IF;

    _final := FLOOR((_base + _bonus) * _multiplier)::int;
    PERFORM public.award_xp(NEW.user_id, _final, 'task_completed', NEW.id, NEW.mission_id, NULL,
      jsonb_build_object('base', _base, 'bonus', _bonus, 'multiplier', _multiplier, 'streak', _new_streak));

    PERFORM public.evaluate_achievements(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS task_xp_trigger ON public.tasks;
CREATE TRIGGER task_xp_trigger
AFTER UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.task_xp_on_complete();

-- ============================================================
-- 10. Mission completion trigger
-- ============================================================
CREATE OR REPLACE FUNCTION public.mission_xp_on_complete()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    INSERT INTO public.user_stats (user_id, missions_completed_total)
    VALUES (NEW.user_id, 1)
    ON CONFLICT (user_id) DO UPDATE
    SET missions_completed_total = public.user_stats.missions_completed_total + 1,
        updated_at = now();

    PERFORM public.award_xp(NEW.user_id, 100, 'mission_completed', NULL, NEW.id);
    PERFORM public.evaluate_achievements(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mission_xp_trigger ON public.missions;
CREATE TRIGGER mission_xp_trigger
AFTER UPDATE ON public.missions
FOR EACH ROW EXECUTE FUNCTION public.mission_xp_on_complete();

-- ============================================================
-- 11. Seed achievements catalog
-- ============================================================
INSERT INTO public.achievements (id, name, description, icon, criteria_type, criteria_value, sort_order) VALUES
  ('first_step',        'Primer Paso',       'Completa tu primera tarea',                     '🎯', 'tasks_completed',     1,   10),
  ('ten_chest',         'Diez al Pecho',     'Completa 10 tareas',                            '💪', 'tasks_completed',     10,  20),
  ('centurion',         'Centurión',         'Completa 100 tareas',                           '🏆', 'tasks_completed',     100, 30),
  ('mission_done',      'Misión Cumplida',   'Completa tu primera misión',                    '🎖️', 'missions_completed',  1,   40),
  ('commander',         'Comandante',        'Completa 5 misiones',                           '⭐', 'missions_completed',  5,   50),
  ('streak_3',          'Tres en Línea',     'Racha de 3 días consecutivos',                  '🔥', 'streak_days',         3,   60),
  ('streak_7',          'Imparable 7',       'Racha de 7 días consecutivos',                  '🔥', 'streak_days',         7,   70),
  ('streak_30',         'Imparable 30',      'Racha de 30 días consecutivos',                 '🔥', 'streak_days',         30,  80),
  ('xp_500',            'Operador',          'Acumula 500 XP',                                '💎', 'total_xp',            500, 90),
  ('xp_1500',           'Comandante XP',     'Acumula 1500 XP',                               '💠', 'total_xp',            1500,100),
  ('xp_5000',           'Estratega',         'Acumula 5000 XP',                               '🌟', 'total_xp',            5000,110),
  ('early_bird_10',     'Madrugador',        'Completa 10 tareas antes de las 9am',           '🌅', 'early_morning_tasks', 10,  120),
  ('resurrection',      'Resurrección',      'Completa una tarea vencida hace más de 7 días', '⚰️', 'overdue_resurrected', 1,   130),
  ('legendary',         'Chamón Legendario', 'Acumula 10,000 XP',                             '👑', 'total_xp',            10000,140),
  ('overdue_killer_3',  'Cazador de Deudas', 'Acumula 3 resurrecciones',                      '⚔️', 'overdue_resurrected', 3,   150);

-- ============================================================
-- 12. Backfill: create stats row + count for existing users
-- ============================================================
INSERT INTO public.user_stats (user_id, tasks_completed_total, missions_completed_total)
SELECT
  p.id,
  COALESCE((SELECT COUNT(*) FROM public.tasks t WHERE t.user_id = p.id AND t.status = 'done' AND t.deleted_at IS NULL), 0),
  COALESCE((SELECT COUNT(*) FROM public.missions m WHERE m.user_id = p.id AND m.status = 'completed' AND m.deleted_at IS NULL), 0)
FROM public.profiles p
ON CONFLICT (user_id) DO NOTHING;
