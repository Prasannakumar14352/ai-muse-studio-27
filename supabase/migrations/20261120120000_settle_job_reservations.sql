-- Credit history showed finished video items as "IN PROGRESS".
-- Cause: since 2026-11-20 video charges carried the video job id in
-- credit_ledger.project_id. finalize_credits copies project_id into
-- usage_history, whose project_id references projects(id), so the FK failed
-- and the row stayed 'reserved'. The app now stores the job id in
-- render_job_id instead; this migration (1) makes finalize_credits tolerate a
-- project_id that isn't a project, and (2) settles the rows already stuck.

CREATE OR REPLACE FUNCTION public.finalize_credits(_ledger_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _row public.credit_ledger%ROWTYPE;
BEGIN
  SELECT * INTO _row FROM public.credit_ledger WHERE id = _ledger_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF _row.status = 'charged' THEN RETURN jsonb_build_object('ok', true, 'reused', true); END IF;
  IF _row.status <> 'reserved' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status', 'status', _row.status);
  END IF;
  UPDATE public.credit_ledger SET status = 'charged', credits_charged = credits_reserved
    WHERE id = _ledger_id;

  -- Mirror into legacy usage_history; only link project_id when it is a real project.
  INSERT INTO public.usage_history (user_id, project_id, credits_used, description, source)
  VALUES (
    _row.user_id,
    (SELECT p.id FROM public.projects p WHERE p.id = _row.project_id),
    _row.credits_reserved,
    COALESCE(_row.description, _row.action),
    _row.source
  );

  RETURN jsonb_build_object('ok', true);
END;
$function$;

-- Move job ids that were written into project_id to render_job_id.
UPDATE public.credit_ledger l
   SET render_job_id = l.project_id,
       project_id = NULL
 WHERE l.project_id IS NOT NULL
   AND l.render_job_id IS NULL
   AND l.action IN ('image', 'image_hd', 'voiceover', 'motion_clip')
   AND l.created_at >= '2026-11-20 00:00:00+00'
   AND NOT EXISTS (SELECT 1 FROM public.projects p WHERE p.id = l.project_id);

-- Settle the job reservations that finished but could not be finalized.
-- The credits were already deducted at reservation time, so balances don't change.
WITH stuck AS (
  UPDATE public.credit_ledger
     SET status = 'charged', credits_charged = credits_reserved
   WHERE status = 'reserved'
     AND render_job_id IS NOT NULL
     AND created_at < now() - interval '15 minutes'
  RETURNING user_id, credits_reserved, description, action, source
)
INSERT INTO public.usage_history (user_id, project_id, credits_used, description, source)
SELECT user_id, NULL, credits_reserved, COALESCE(description, action), source FROM stuck;

-- Pricing: the Free card listed "All core modules", but Video, Research and
-- Thumbnails require Starter. Replace that bullet with what Free includes.
UPDATE public.pricing_plans
   SET features = (
     SELECT jsonb_agg(CASE WHEN f = 'All core modules'
                           THEN 'AI images, carousels, captions & LinkedIn posts'
                           ELSE f END)
       FROM jsonb_array_elements_text(features) AS f
   )
 WHERE code = 'free'
   AND features ? 'All core modules';
