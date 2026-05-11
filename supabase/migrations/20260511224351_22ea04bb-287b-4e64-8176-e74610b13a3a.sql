ALTER TABLE public.assets DROP CONSTRAINT IF EXISTS assets_property_id_fkey;
ALTER TABLE public.assets ADD CONSTRAINT assets_property_id_fkey
  FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE RESTRICT;