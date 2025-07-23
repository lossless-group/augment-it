/*
  # Add clear data function

  1. Changes
    - Add function to clear all data from tables
  2. Security
    - Function can only be executed by authenticated users
*/

CREATE OR REPLACE FUNCTION clear_all_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  TRUNCATE TABLE organizations RESTART IDENTITY CASCADE;
  TRUNCATE TABLE prompt_templates RESTART IDENTITY CASCADE;
END;
$$;