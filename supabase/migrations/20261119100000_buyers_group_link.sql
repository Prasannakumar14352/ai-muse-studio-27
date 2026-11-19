-- Private Telegram group link shown only to users with an active paid plan.
-- Lives in the service-role-only agent_settings row; the app hands it out
-- through a server function that checks the user's plan first.
ALTER TABLE public.agent_settings ADD COLUMN IF NOT EXISTS buyers_group_invite_url text;
