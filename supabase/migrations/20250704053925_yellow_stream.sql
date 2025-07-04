/*
  # Fix RLS policy for subjective tests creation

  1. Security Changes
    - Add INSERT policy for teachers to create subjective tests
    - Ensure teachers can insert new tests where they are the creator

  This migration fixes the "new row violates row-level security policy" error
  by adding the missing INSERT policy for the subjective_tests table.
*/

-- Add INSERT policy for teachers to create subjective tests
CREATE POLICY "Teachers can create subjective tests"
  ON subjective_tests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (created_by = auth.uid()) AND 
    (EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() AND users.role = 'teacher'
    ))
  );