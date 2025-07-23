/*
  # Add AI Model Configs table

  1. New Tables
    - `ai_model_configs`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `model_id` (text)
      - `api_key` (text)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
  2. Security
    - Enable RLS on `ai_model_configs` table
    - Add policies for authenticated users to manage their own configs
*/

CREATE TABLE IF NOT EXISTS ai_model_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  model_id text NOT NULL,
  api_key text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, model_id)
);

ALTER TABLE ai_model_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own configs"
  ON ai_model_configs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own configs"
  ON ai_model_configs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own configs"
  ON ai_model_configs
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own configs"
  ON ai_model_configs
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);