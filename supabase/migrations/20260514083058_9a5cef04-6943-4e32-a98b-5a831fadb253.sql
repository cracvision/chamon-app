ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY[
    'digest','alert','overdue',
    'vendor_cleaning_notify','vendor_notify_failed','vendor_notify_skipped','vendor_escalation'
  ]));