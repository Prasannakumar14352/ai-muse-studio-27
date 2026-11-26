-- Promo Studio storage: renders/<uid>/promo-studio/** is admin-only, even for the owner's own
-- client session. RESTRICTIVE, so it is ANDed with the existing owner policies
-- (20260706072636) and only narrows access to the promo-studio subfolder of the renders bucket.
-- Kept in its own migration so it can be reverted alone:
--   DROP POLICY "promo-studio folder is admin only" ON storage.objects;
--
-- CASE (rather than OR) guarantees has_role() is only evaluated for promo-studio paths, so
-- every other storage request stays exactly as before and never depends on has_role grants.
DROP POLICY IF EXISTS "promo-studio folder is admin only" ON storage.objects;
CREATE POLICY "promo-studio folder is admin only" ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    CASE WHEN bucket_id = 'renders' AND (storage.foldername(name))[2] = 'promo-studio'
         THEN coalesce(public.has_role(auth.uid(), 'admin'), false)
         ELSE true
    END)
  WITH CHECK (
    CASE WHEN bucket_id = 'renders' AND (storage.foldername(name))[2] = 'promo-studio'
         THEN coalesce(public.has_role(auth.uid(), 'admin'), false)
         ELSE true
    END);
