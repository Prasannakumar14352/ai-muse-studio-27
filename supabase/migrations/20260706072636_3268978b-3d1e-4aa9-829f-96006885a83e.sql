
-- RLS policies for the "renders" private bucket. Files are stored under `<user_id>/<filename>`.
CREATE POLICY "Users can read own renders"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'renders' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload own renders"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'renders' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update own renders"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'renders' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own renders"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'renders' AND auth.uid()::text = (storage.foldername(name))[1]);
