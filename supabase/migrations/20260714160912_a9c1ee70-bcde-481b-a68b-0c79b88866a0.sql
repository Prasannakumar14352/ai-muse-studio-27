-- Allow public (anon + authenticated) reads of active templates so the
-- catalog is visible via the server publishable-key client used by
-- listTemplatesFn. Admin write policies remain unchanged.
DROP POLICY IF EXISTS "auth_read_active_templates" ON public.templates;
CREATE POLICY "public_read_active_templates"
  ON public.templates FOR SELECT
  TO anon, authenticated
  USING (active = true OR public.has_role(auth.uid(), 'admin'::public.app_role));

GRANT SELECT ON public.templates TO anon;