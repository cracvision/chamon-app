
-- =============================================
-- PROFILES
-- =============================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  timezone TEXT NOT NULL DEFAULT 'America/Puerto_Rico',
  notification_email TEXT,
  digest_hour INT NOT NULL DEFAULT 7,
  digest_enabled BOOLEAN NOT NULL DEFAULT true,
  preferred_language TEXT NOT NULL DEFAULT 'es' CHECK (preferred_language IN ('es','en')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- =============================================
-- AREAS
-- =============================================
CREATE TABLE public.areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code TEXT,
  name TEXT NOT NULL,
  color TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
ALTER TABLE public.areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "areas_select_own" ON public.areas FOR SELECT TO authenticated USING (auth.uid() = user_id AND deleted_at IS NULL);
CREATE POLICY "areas_select_trash" ON public.areas FOR SELECT TO authenticated USING (auth.uid() = user_id AND deleted_at IS NOT NULL);
CREATE POLICY "areas_insert_own" ON public.areas FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "areas_update_own" ON public.areas FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =============================================
-- MISSIONS
-- =============================================
CREATE TABLE public.missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  area_id UUID REFERENCES public.areas(id) ON DELETE SET NULL,
  code TEXT,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'mid' CHECK (priority IN ('low','mid','high')),
  health TEXT CHECK (health IN ('ok','warn','crit')),
  due_date DATE,
  cost_of_inaction_weekly NUMERIC(10,2) NOT NULL DEFAULT 0,
  reward_text TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived','completed')),
  completed_at TIMESTAMPTZ,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
ALTER TABLE public.missions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "missions_select_own" ON public.missions FOR SELECT TO authenticated USING (auth.uid() = user_id AND deleted_at IS NULL);
CREATE POLICY "missions_select_trash" ON public.missions FOR SELECT TO authenticated USING (auth.uid() = user_id AND deleted_at IS NOT NULL);
CREATE POLICY "missions_insert_own" ON public.missions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "missions_update_own" ON public.missions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_missions_user ON public.missions(user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_missions_area ON public.missions(area_id);

-- =============================================
-- TASKS
-- =============================================
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mission_id UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  notes TEXT,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','doing','waiting','done')),
  friction_level INT NOT NULL DEFAULT 2 CHECK (friction_level BETWEEN 1 AND 3),
  is_today BOOLEAN NOT NULL DEFAULT false,
  effort_minutes INT,
  completed_at TIMESTAMPTZ,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tasks_select_own" ON public.tasks FOR SELECT TO authenticated USING (auth.uid() = user_id AND deleted_at IS NULL);
CREATE POLICY "tasks_select_trash" ON public.tasks FOR SELECT TO authenticated USING (auth.uid() = user_id AND deleted_at IS NOT NULL);
CREATE POLICY "tasks_insert_own" ON public.tasks FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "tasks_update_own" ON public.tasks FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_tasks_mission ON public.tasks(mission_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_user_today ON public.tasks(user_id) WHERE is_today = true AND deleted_at IS NULL;
CREATE INDEX idx_tasks_due ON public.tasks(user_id, due_date) WHERE deleted_at IS NULL;

-- =============================================
-- CONTACTS
-- =============================================
CREATE TABLE public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT,
  phone TEXT,
  email TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contacts_select_own" ON public.contacts FOR SELECT TO authenticated USING (auth.uid() = user_id AND deleted_at IS NULL);
CREATE POLICY "contacts_insert_own" ON public.contacts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "contacts_update_own" ON public.contacts FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =============================================
-- TASK_CONTACTS
-- =============================================
CREATE TABLE public.task_contacts (
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, contact_id)
);
ALTER TABLE public.task_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_contacts_select_own" ON public.task_contacts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "task_contacts_insert_own" ON public.task_contacts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "task_contacts_delete_own" ON public.task_contacts FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- =============================================
-- ATTACHMENTS
-- =============================================
CREATE TABLE public.attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  mission_id UUID REFERENCES public.missions(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_size BIGINT,
  mime_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT attachment_target CHECK (
    (task_id IS NOT NULL AND mission_id IS NULL) OR
    (task_id IS NULL AND mission_id IS NOT NULL)
  )
);
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attachments_select_own" ON public.attachments FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "attachments_insert_own" ON public.attachments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "attachments_delete_own" ON public.attachments FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_attachments_task ON public.attachments(task_id);
CREATE INDEX idx_attachments_mission ON public.attachments(mission_id);

-- =============================================
-- EVENTS (audit log)
-- =============================================
CREATE TABLE public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('mission','task','attachment','contact')),
  entity_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('created','updated','completed','due_changed','status_changed','deleted','restored')),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "events_select_own" ON public.events FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "events_insert_own" ON public.events FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- =============================================
-- NOTIFICATIONS
-- =============================================
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('digest','alert','overdue')),
  task_id UUID,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  email_to TEXT,
  subject TEXT,
  status TEXT NOT NULL CHECK (status IN ('sent','failed','queued')),
  error TEXT
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_select_own" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- =============================================
-- TRIGGERS
-- =============================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  IF TG_OP = 'UPDATE' AND auth.uid() IS NOT NULL THEN
    NEW.updated_by = auth.uid();
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.set_user_id_on_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.user_id IS NULL THEN NEW.user_id = auth.uid(); END IF;
  IF NEW.created_by IS NULL THEN NEW.created_by = auth.uid(); END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.task_completion()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'done' AND (OLD.status IS DISTINCT FROM 'done') THEN
    NEW.completed_at = now();
  ELSIF NEW.status <> 'done' AND OLD.status = 'done' THEN
    NEW.completed_at = NULL;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.audit_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _action TEXT; _entity TEXT;
BEGIN
  _entity := TG_TABLE_NAME;
  IF TG_OP = 'INSERT' THEN _action := 'created';
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN _action := 'deleted';
    ELSIF NEW.deleted_at IS NULL AND OLD.deleted_at IS NOT NULL THEN _action := 'restored';
    ELSIF (TG_TABLE_NAME='tasks' AND NEW.status IS DISTINCT FROM OLD.status) THEN _action := 'status_changed';
    ELSIF NEW.due_date IS DISTINCT FROM OLD.due_date THEN _action := 'due_changed';
    ELSE _action := 'updated';
    END IF;
  END IF;
  INSERT INTO public.events (user_id, entity_type, entity_id, action, metadata)
  VALUES (COALESCE(NEW.user_id, OLD.user_id),
          CASE _entity WHEN 'missions' THEN 'mission' WHEN 'tasks' THEN 'task' END,
          NEW.id, _action, NULL);
  RETURN NEW;
END $$;

-- Apply triggers
CREATE TRIGGER trg_areas_uid BEFORE INSERT ON public.areas FOR EACH ROW EXECUTE FUNCTION public.set_user_id_on_insert();
CREATE TRIGGER trg_areas_upd BEFORE UPDATE ON public.areas FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_missions_uid BEFORE INSERT ON public.missions FOR EACH ROW EXECUTE FUNCTION public.set_user_id_on_insert();
CREATE TRIGGER trg_missions_upd BEFORE UPDATE ON public.missions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_missions_audit AFTER INSERT OR UPDATE ON public.missions FOR EACH ROW EXECUTE FUNCTION public.audit_change();

CREATE TRIGGER trg_tasks_uid BEFORE INSERT ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.set_user_id_on_insert();
CREATE TRIGGER trg_tasks_upd BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_tasks_complete BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.task_completion();
CREATE TRIGGER trg_tasks_audit AFTER INSERT OR UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.audit_change();

CREATE TRIGGER trg_contacts_uid BEFORE INSERT ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.set_user_id_on_insert();
CREATE TRIGGER trg_contacts_upd BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_attachments_uid BEFORE INSERT ON public.attachments FOR EACH ROW EXECUTE FUNCTION public.set_user_id_on_insert();

-- =============================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- =============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, notification_email)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email);
  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER trg_profiles_upd BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================
-- STORAGE BUCKET
-- =============================================
INSERT INTO storage.buckets (id, name, public) VALUES ('task-attachments', 'task-attachments', false);

CREATE POLICY "att_select_own" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'task-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "att_insert_own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'task-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "att_update_own" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'task-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "att_delete_own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'task-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);
