/*
  # Complete EduBot AI Database Schema

  1. New Tables
    - `users` - User profiles with roles and gamification
    - `documents` - Teacher-uploaded learning materials
    - `quizzes` - Multiple choice quizzes
    - `quiz_attempts` - Student quiz submissions
    - `chats` - AI chat history
    - `subjective_tests` - Subjective question tests
    - `subjective_submissions` - Student subjective test submissions

  2. Security
    - Enable RLS on all tables
    - Role-based access policies
    - Students can view content, teachers can manage content
*/

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  name text NOT NULL,
  role text NOT NULL,
  xp_points integer DEFAULT 0,
  badges text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  CONSTRAINT users_role_check CHECK (role = ANY (ARRAY['student'::text, 'teacher'::text]))
);

-- Create documents table
CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by uuid REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  subject text NOT NULL,
  file_url text NOT NULL,
  vector text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Create quizzes table
CREATE TABLE IF NOT EXISTS quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  questions jsonb DEFAULT '[]'::jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create quiz_attempts table
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid REFERENCES quizzes(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  score double precision NOT NULL,
  answers jsonb DEFAULT '{}'::jsonb NOT NULL,
  timestamp timestamptz DEFAULT now()
);

-- Create chats table
CREATE TABLE IF NOT EXISTS chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  question text NOT NULL,
  answer text NOT NULL,
  document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  timestamp timestamptz DEFAULT now()
);

-- Create subjective_tests table
CREATE TABLE IF NOT EXISTS subjective_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  questions jsonb DEFAULT '[]'::jsonb NOT NULL,
  max_score integer DEFAULT 100,
  time_limit integer DEFAULT 60,
  created_at timestamptz DEFAULT now()
);

-- Create subjective_submissions table
CREATE TABLE IF NOT EXISTS subjective_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id uuid REFERENCES subjective_tests(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  answers jsonb DEFAULT '[]'::jsonb NOT NULL,
  ai_score double precision DEFAULT 0,
  teacher_score double precision,
  ai_feedback text,
  teacher_feedback text,
  status text DEFAULT 'submitted',
  submitted_at timestamptz DEFAULT now(),
  ai_graded_at timestamptz,
  teacher_reviewed_at timestamptz,
  CONSTRAINT subjective_submissions_status_check CHECK (status = ANY (ARRAY['submitted'::text, 'ai_graded'::text, 'teacher_reviewed'::text]))
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users USING btree (email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users USING btree (role);
CREATE INDEX IF NOT EXISTS idx_documents_uploaded_by ON documents USING btree (uploaded_by);
CREATE INDEX IF NOT EXISTS idx_documents_subject ON documents USING btree (subject);
CREATE INDEX IF NOT EXISTS idx_quizzes_created_by ON quizzes USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_quiz_id ON quiz_attempts USING btree (quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user_id ON quiz_attempts USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_chats_user_id ON chats USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_subjective_tests_created_by ON subjective_tests USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_subjective_submissions_test_id ON subjective_submissions USING btree (test_id);
CREATE INDEX IF NOT EXISTS idx_subjective_submissions_user_id ON subjective_submissions USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_subjective_submissions_status ON subjective_submissions USING btree (status);

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjective_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjective_submissions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist before creating new ones
DROP POLICY IF EXISTS "Users can read own profile" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "Users can insert own profile" ON users;

DROP POLICY IF EXISTS "Students can view all documents" ON documents;
DROP POLICY IF EXISTS "Teachers can view all documents" ON documents;
DROP POLICY IF EXISTS "Teachers can manage own documents" ON documents;

DROP POLICY IF EXISTS "Students can view all quizzes" ON quizzes;
DROP POLICY IF EXISTS "Teachers can view all quizzes" ON quizzes;
DROP POLICY IF EXISTS "Teachers can manage own quizzes" ON quizzes;

DROP POLICY IF EXISTS "Users can manage own quiz attempts" ON quiz_attempts;
DROP POLICY IF EXISTS "Teachers can view all quiz attempts" ON quiz_attempts;

DROP POLICY IF EXISTS "Users can manage own chats" ON chats;
DROP POLICY IF EXISTS "Teachers can view all chats" ON chats;

DROP POLICY IF EXISTS "Students can view all subjective tests" ON subjective_tests;
DROP POLICY IF EXISTS "Teachers can view all subjective tests" ON subjective_tests;
DROP POLICY IF EXISTS "Teachers can manage own subjective tests" ON subjective_tests;

DROP POLICY IF EXISTS "Students can manage own submissions" ON subjective_submissions;
DROP POLICY IF EXISTS "Teachers can view and update all submissions" ON subjective_submissions;

-- Users policies
CREATE POLICY "Users can read own profile"
  ON users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON users
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Documents policies
CREATE POLICY "Students can view all documents"
  ON documents
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() AND users.role = 'student'
  ));

CREATE POLICY "Teachers can view all documents"
  ON documents
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() AND users.role = 'teacher'
  ));

CREATE POLICY "Teachers can manage own documents"
  ON documents
  FOR ALL
  TO authenticated
  USING (
    uploaded_by = auth.uid() AND 
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() AND users.role = 'teacher'
    )
  );

-- Quizzes policies
CREATE POLICY "Students can view all quizzes"
  ON quizzes
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() AND users.role = 'student'
  ));

CREATE POLICY "Teachers can view all quizzes"
  ON quizzes
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() AND users.role = 'teacher'
  ));

CREATE POLICY "Teachers can manage own quizzes"
  ON quizzes
  FOR ALL
  TO authenticated
  USING (
    created_by = auth.uid() AND 
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() AND users.role = 'teacher'
    )
  );

-- Quiz attempts policies
CREATE POLICY "Users can manage own quiz attempts"
  ON quiz_attempts
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Teachers can view all quiz attempts"
  ON quiz_attempts
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() AND users.role = 'teacher'
  ));

-- Chats policies
CREATE POLICY "Users can manage own chats"
  ON chats
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Teachers can view all chats"
  ON chats
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() AND users.role = 'teacher'
  ));

-- Subjective tests policies
CREATE POLICY "Students can view all subjective tests"
  ON subjective_tests
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() AND users.role = 'student'
  ));

CREATE POLICY "Teachers can view all subjective tests"
  ON subjective_tests
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() AND users.role = 'teacher'
  ));

CREATE POLICY "Teachers can manage own subjective tests"
  ON subjective_tests
  FOR ALL
  TO authenticated
  USING (
    created_by = auth.uid() AND 
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() AND users.role = 'teacher'
    )
  );

-- Subjective submissions policies
CREATE POLICY "Students can manage own submissions"
  ON subjective_submissions
  FOR ALL
  TO authenticated
  USING (
    user_id = auth.uid() AND 
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() AND users.role = 'student'
    )
  );

CREATE POLICY "Teachers can view and update all submissions"
  ON subjective_submissions
  FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() AND users.role = 'teacher'
  ));