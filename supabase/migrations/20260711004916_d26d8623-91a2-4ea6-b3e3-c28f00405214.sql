
UPDATE public.usage_history SET project_id = NULL
  WHERE project_id IS NOT NULL AND project_id NOT IN (SELECT id FROM public.projects);
ALTER TABLE public.usage_history
  ADD CONSTRAINT usage_history_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;
