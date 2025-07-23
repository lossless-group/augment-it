CREATE TABLE response_highlights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id uuid NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  highlights jsonb DEFAULT '[]'::jsonb,
  section_id uuid,
  section_title text,
  model_id text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE response_highlights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own highlights"
  ON response_highlights
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own highlights"
  ON response_highlights
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own highlights"
  ON response_highlights
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own highlights"
  ON response_highlights
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Add indexes for better query performance
CREATE INDEX response_highlights_user_id_idx ON response_highlights(user_id);
CREATE INDEX response_highlights_response_id_idx ON response_highlights(response_id);
CREATE INDEX response_highlights_section_id_idx ON response_highlights(section_id);