-- In-app support chat (bottom-right widget). One running thread per user.
-- The server writes every row with the service role; users can only read
-- their own thread.
CREATE TABLE IF NOT EXISTS public.support_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('user','assistant','admin')),
  text text NOT NULL,
  category text,                         -- question | bug | billing | feature | chat
  page text,                             -- the app page the user was on
  task_id uuid REFERENCES public.agent_tasks(id) ON DELETE SET NULL,
  seen_by_user boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_chat_user_idx ON public.support_chat_messages (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS support_chat_created_idx ON public.support_chat_messages (created_at DESC);
ALTER TABLE public.support_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own support chat" ON public.support_chat_messages;
CREATE POLICY "own support chat" ON public.support_chat_messages FOR SELECT TO authenticated
  USING (user_id = auth.uid());
