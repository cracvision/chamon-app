CREATE OR REPLACE FUNCTION public.reassign_vendor_primary(
  _property_id uuid,
  _vendor_category text,
  _new_contact_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_existing_id uuid;
  v_existing_contact uuid;
  v_new_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT id, contact_id INTO v_existing_id, v_existing_contact
  FROM property_vendor_assignments
  WHERE property_id = _property_id
    AND vendor_category = _vendor_category
    AND is_primary = true
    AND deleted_at IS NULL
    AND user_id = v_user_id
  LIMIT 1;

  IF v_existing_id IS NOT NULL AND v_existing_contact = _new_contact_id THEN
    RETURN v_existing_id;
  END IF;

  IF v_existing_id IS NOT NULL THEN
    UPDATE property_vendor_assignments
    SET deleted_at = now(),
        deleted_by = v_user_id,
        updated_at = now(),
        updated_by = v_user_id,
        is_primary = false
    WHERE id = v_existing_id;
  END IF;

  INSERT INTO property_vendor_assignments (
    user_id, property_id, contact_id, vendor_category, is_primary,
    created_by, updated_by
  ) VALUES (
    v_user_id, _property_id, _new_contact_id, _vendor_category, true,
    v_user_id, v_user_id
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reassign_vendor_primary(uuid, text, uuid) TO authenticated;