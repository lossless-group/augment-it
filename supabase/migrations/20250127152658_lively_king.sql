/*
  # Add record columns to response_highlights table

  1. Changes
    - Add record_id and record_name columns
    - Set default values for existing rows
    - Add NOT NULL constraints after data migration
    - Add index on record_id for better query performance

  2. Security
    - Maintain existing RLS policies
*/

-- Add columns initially as nullable
ALTER TABLE response_highlights
ADD COLUMN IF NOT EXISTS record_id uuid,
ADD COLUMN IF NOT EXISTS record_name text;

-- Create a function to get the first organization's ID and name
CREATE OR REPLACE FUNCTION get_default_organization()
RETURNS TABLE (id uuid, name text)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT o.id, o.name
  FROM organizations o
  ORDER BY o.created_at
  LIMIT 1;
END;
$$;

-- Update existing rows with default values
DO $$
DECLARE
  default_org RECORD;
BEGIN
  SELECT * INTO default_org FROM get_default_organization();
  
  IF default_org.id IS NOT NULL THEN
    UPDATE response_highlights
    SET 
      record_id = default_org.id,
      record_name = default_org.name
    WHERE record_id IS NULL;
  END IF;
END $$;

-- Now add NOT NULL constraints
ALTER TABLE response_highlights
ALTER COLUMN record_id SET NOT NULL,
ALTER COLUMN record_name SET NOT NULL;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS response_highlights_record_id_idx 
ON response_highlights(record_id);

-- Drop and recreate policies to ensure they're up to date
DROP POLICY IF EXISTS "Users can view their own highlights" ON response_highlights;
DROP POLICY IF EXISTS "Users can create their own highlights" ON response_highlights;
DROP POLICY IF EXISTS "Users can update their own highlights" ON response_highlights;
DROP POLICY IF EXISTS "Users can delete their own highlights" ON response_highlights;

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

-- Clean up
DROP FUNCTION IF EXISTS get_default_organization();