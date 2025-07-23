/*
  # Update database schema for dynamic customer properties

  1. Changes
    - Modify organizations table to use JSONB for dynamic properties
    - Ensure RLS policies exist for both tables
    - Handle cases where policies may already exist
*/

-- Organizations table
DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS organizations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    properties jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now()
  );
EXCEPTION
  WHEN duplicate_table THEN NULL;
END $$;

-- Enable RLS if not already enabled
DO $$ BEGIN
  EXECUTE format('ALTER TABLE organizations ENABLE ROW LEVEL SECURITY');
EXCEPTION
  WHEN feature_not_supported THEN NULL;
END $$;

-- Drop existing policies if they exist and recreate them
DO $$ BEGIN
  DROP POLICY IF EXISTS "Organizations are viewable by authenticated users" ON organizations;
  DROP POLICY IF EXISTS "Organizations can be created by authenticated users" ON organizations;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

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
DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS prompt_templates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL,
    description text,
    mdx_content text NOT NULL,
    sections jsonb DEFAULT '[]'::jsonb,
    created_at timestamptz DEFAULT now()
  );
EXCEPTION
  WHEN duplicate_table THEN NULL;
END $$;

-- Enable RLS if not already enabled
DO $$ BEGIN
  EXECUTE format('ALTER TABLE prompt_templates ENABLE ROW LEVEL SECURITY');
EXCEPTION
  WHEN feature_not_supported THEN NULL;
END $$;

-- Drop existing policies if they exist and recreate them
DO $$ BEGIN
  DROP POLICY IF EXISTS "Prompt templates are viewable by authenticated users" ON prompt_templates;
  DROP POLICY IF EXISTS "Prompt templates can be created by authenticated users" ON prompt_templates;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

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