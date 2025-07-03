/*
  # Subjective Tests Feature

  1. New Tables
    - `subjective_tests`
      - `id` (uuid, primary key)
      - `created_by` (uuid, foreign key to users)
      - `title` (text)
      - `document_id` (uuid, foreign key to documents)
      - `questions` (jsonb) - Array of subjective question objects
      - `max_score` (integer)
      - `time_limit` (integer) - in minutes
      - `created_at` (timestamp)
    - `subjective_submissions`
      - `id` (uuid, primary key)
      - `test_id` (uuid, foreign key to subjective_tests)
      - `user_id` (uuid, foreign key to users)
      - `answers` (jsonb) - Array of answer objects with image URLs
      - `ai_score` (float)
      - `teacher_score` (float, nullable)
      - `ai_feedback` (text)
      - `teacher_feedback` (text, nullable)
      - `status` (text) - 'submitted', 'ai_graded', 'teacher_reviewed'
      - `submitted_at` (timestamp)
      - `ai_graded_at` (timestamp, nullable)
      - `teacher_reviewed_at` (timestamp, nullable)

  2. Security
    - Enable RLS on all tables
    - Add policies for teachers to manage tests and view submissions
    - Students can view tests and submit answers
*/

-- Create subjective_tests table
CREATE TABLE IF NOT EXISTS subjective_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  questions jsonb NOT NULL DEFAULT '[]',
  max_score integer DEFAULT 100,
  time_limit integer DEFAULT 60,
  created_at timestamptz DEFAULT now()
);

-- Create subjective_submissions table
CREATE TABLE IF NOT EXISTS subjective_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id uuid REFERENCES subjective_tests(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  answers jsonb NOT NULL DEFAULT '[]',
  ai_score float DEFAULT 0,
  teacher_score float,
  ai_feedback text,
  teacher_feedback text,
  status text DEFAULT 'submitted' CHECK (status IN ('submitted', 'ai_graded', 'teacher_reviewed')),
  submitted_at timestamptz DEFAULT now(),
  ai_graded_at timestamptz,
  teacher_reviewed_at timestamptz
);

-- Enable Row Level Security
ALTER TABLE subjective_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjective_submissions ENABLE ROW LEVEL SECURITY;

-- Subjective tests policies
CREATE POLICY "Teachers can manage own subjective tests"
  ON subjective_tests
  FOR ALL
  TO authenticated
  USING (
    created_by = auth.uid() AND 
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'teacher')
  );

CREATE POLICY "Students can view all subjective tests"
  ON subjective_tests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'student')
  );

CREATE POLICY "Teachers can view all subjective tests"
  ON subjective_tests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'teacher')
  );

-- Subjective submissions policies
CREATE POLICY "Students can manage own submissions"
  ON subjective_submissions
  FOR ALL
  TO authenticated
  USING (
    user_id = auth.uid() AND
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'student')
  );

CREATE POLICY "Teachers can view and update all submissions"
  ON subjective_submissions
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'teacher')
  );

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_subjective_tests_created_by ON subjective_tests(created_by);
CREATE INDEX IF NOT EXISTS idx_subjective_submissions_test_id ON subjective_submissions(test_id);
CREATE INDEX IF NOT EXISTS idx_subjective_submissions_user_id ON subjective_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_subjective_submissions_status ON subjective_submissions(status);