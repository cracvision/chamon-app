-- 1. Create private bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('incident-attachments', 'incident-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- 2. Storage RLS policies (folder = user_id)
DROP POLICY IF EXISTS "incident_attachments_storage_select" ON storage.objects;
CREATE POLICY "incident_attachments_storage_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'incident-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "incident_attachments_storage_insert" ON storage.objects;
CREATE POLICY "incident_attachments_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'incident-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "incident_attachments_storage_update" ON storage.objects;
CREATE POLICY "incident_attachments_storage_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'incident-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "incident_attachments_storage_delete" ON storage.objects;
CREATE POLICY "incident_attachments_storage_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'incident-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );