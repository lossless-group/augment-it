/*
  # Initial Schema Setup

  1. New Tables
    - `organizations`
      - `id` (uuid, primary key)
      - `name` (text, required)
      - `details` (jsonb, for flexible organization details)
      - `created_at` (timestamp)
    
    - `prompt_templates`
      - `id` (uuid, primary key)
      - `title` (text, required)
      - `description` (text)
      - `mdx_content` (text, required)
      - `sections` (jsonb, for template sections)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on both tables
    - Add policies for authenticated users to read all data
    - Add policies for authenticated users to create new data
*/

-- Organizations table
CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Organizations are viewable by authenticated users"
  ON organizations
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Organizations can be created by authenticated users"
  ON organizations
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Prompt templates table
CREATE TABLE IF NOT EXISTS prompt_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  mdx_content text NOT NULL,
  sections jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE prompt_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Prompt templates are viewable by authenticated users"
  ON prompt_templates
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Prompt templates can be created by authenticated users"
  ON prompt_templates
  FOR INSERT
  TO authenticated
  WITH CHECK (true);