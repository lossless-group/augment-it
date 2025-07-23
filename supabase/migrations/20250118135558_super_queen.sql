/*
  # Database Schema Update

  1. Tables
    - organizations: Stores organization data with dynamic properties
    - prompt_templates: Stores prompt templates with sections

  2. Security
    - Enable RLS for both tables
    - Add policies for authenticated users
*/

-- Drop existing tables if they exist
DROP TABLE IF EXISTS organizations CASCADE;
DROP TABLE IF EXISTS prompt_templates CASCADE;

-- Organizations table
CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  properties jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- Create policies
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
CREATE TABLE prompt_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  mdx_content text NOT NULL,
  sections jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE prompt_templates ENABLE ROW LEVEL SECURITY;

-- Create policies
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