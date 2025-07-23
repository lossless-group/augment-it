/*
  # Clear all data from tables

  1. Changes
    - Delete all data from organizations table
    - Delete all data from prompt_templates table
    - Reset sequences
  2. Security
    - Maintains existing RLS policies
*/

-- Delete all data from tables
TRUNCATE TABLE organizations RESTART IDENTITY CASCADE;
TRUNCATE TABLE prompt_templates RESTART IDENTITY CASCADE;