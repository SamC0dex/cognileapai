-- ============================================
-- COURSES SYSTEM DATABASE SCHEMA
-- ============================================

-- 1. COURSES TABLE
CREATE TABLE IF NOT EXISTS courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,

  title TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,

  difficulty TEXT CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  estimated_hours INTEGER,
  total_lessons INTEGER DEFAULT 0,
  total_chapters INTEGER DEFAULT 0,

  -- Generation tracking
  status TEXT DEFAULT 'generating' CHECK (status IN ('generating', 'ready', 'error')),
  generation_progress JSONB DEFAULT '{}'::jsonb, -- {phase, percentage, currentStep, error}
  custom_instructions TEXT, -- Optional user customization

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. CHAPTERS TABLE
CREATE TABLE IF NOT EXISTS chapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,

  title TEXT NOT NULL,
  description TEXT,
  order_index INTEGER NOT NULL,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. LESSONS TABLE
CREATE TABLE IF NOT EXISTS lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,

  title TEXT NOT NULL,
  description TEXT,
  learning_objective TEXT,

  -- Content
  content_markdown TEXT NOT NULL,
  images JSONB DEFAULT '[]'::jsonb, -- Array of {url, caption, position}
  interactive_elements JSONB DEFAULT '{}'::jsonb, -- Tooltips, diagrams, etc.
  videos JSONB DEFAULT '[]'::jsonb, -- Embedded videos

  -- Metadata
  order_index INTEGER NOT NULL,
  lesson_number TEXT, -- e.g., "1.1", "2.3"
  estimated_minutes INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. LESSON QUIZZES TABLE
CREATE TABLE IF NOT EXISTS lesson_quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,

  question TEXT NOT NULL,
  question_type TEXT DEFAULT 'multiple_choice' CHECK (question_type IN ('multiple_choice', 'true_false', 'fill_blank')),

  options JSONB NOT NULL, -- Array of answer options
  correct_answer TEXT NOT NULL,
  explanation TEXT NOT NULL,

  difficulty TEXT CHECK (difficulty IN ('easy', 'medium', 'hard')),
  order_index INTEGER NOT NULL,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. USER COURSE PROGRESS TABLE
CREATE TABLE IF NOT EXISTS user_course_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,

  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  last_accessed_at TIMESTAMPTZ DEFAULT NOW(),

  completion_percentage INTEGER DEFAULT 0 CHECK (completion_percentage >= 0 AND completion_percentage <= 100),
  current_lesson_id UUID REFERENCES lessons(id),

  total_time_seconds INTEGER DEFAULT 0,
  lessons_completed INTEGER DEFAULT 0,

  UNIQUE(user_id, course_id)
);

-- 6. LESSON COMPLETIONS TABLE
CREATE TABLE IF NOT EXISTS lesson_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,

  completed_at TIMESTAMPTZ DEFAULT NOW(),
  quiz_score INTEGER, -- Percentage (0-100)
  time_spent_seconds INTEGER,

  UNIQUE(user_id, lesson_id)
);

-- 7. USER STREAKS TABLE
CREATE TABLE IF NOT EXISTS user_streaks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  last_study_date DATE,

  UNIQUE(user_id)
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

CREATE INDEX idx_courses_user_id ON courses(user_id);
CREATE INDEX idx_chapters_course_id ON chapters(course_id);
CREATE INDEX idx_lessons_course_id ON lessons(course_id);
CREATE INDEX idx_lessons_chapter_id ON lessons(chapter_id);
CREATE INDEX idx_lesson_quizzes_lesson_id ON lesson_quizzes(lesson_id);
CREATE INDEX idx_user_course_progress_user_id ON user_course_progress(user_id);
CREATE INDEX idx_user_course_progress_course_id ON user_course_progress(course_id);
CREATE INDEX idx_lesson_completions_user_id ON lesson_completions(user_id);
CREATE INDEX idx_lesson_completions_lesson_id ON lesson_completions(lesson_id);
CREATE INDEX idx_user_streaks_user_id ON user_streaks(user_id);

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_course_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_streaks ENABLE ROW LEVEL SECURITY;

-- Courses: Users can only access their own courses
CREATE POLICY "Users can view their own courses"
  ON courses FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own courses"
  ON courses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own courses"
  ON courses FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own courses"
  ON courses FOR DELETE
  USING (auth.uid() = user_id);

-- Chapters: Access via course ownership
CREATE POLICY "Users can view chapters of their courses"
  ON chapters FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = chapters.course_id
      AND courses.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create chapters in their courses"
  ON chapters FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = chapters.course_id
      AND courses.user_id = auth.uid()
    )
  );

-- Lessons: Access via course ownership
CREATE POLICY "Users can view lessons of their courses"
  ON lessons FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = lessons.course_id
      AND courses.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create lessons in their courses"
  ON lessons FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = lessons.course_id
      AND courses.user_id = auth.uid()
    )
  );

-- Lesson Quizzes: Access via lesson ownership
CREATE POLICY "Users can view quizzes of their lessons"
  ON lesson_quizzes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM lessons
      JOIN courses ON courses.id = lessons.course_id
      WHERE lessons.id = lesson_quizzes.lesson_id
      AND courses.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create quizzes in their lessons"
  ON lesson_quizzes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM lessons
      JOIN courses ON courses.id = lessons.course_id
      WHERE lessons.id = lesson_quizzes.lesson_id
      AND courses.user_id = auth.uid()
    )
  );

-- User Course Progress: Users only see their own progress
CREATE POLICY "Users can view their own progress"
  ON user_course_progress FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own progress"
  ON user_course_progress FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own progress"
  ON user_course_progress FOR UPDATE
  USING (auth.uid() = user_id);

-- Lesson Completions: Users only see their own completions
CREATE POLICY "Users can view their own completions"
  ON lesson_completions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own completions"
  ON lesson_completions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- User Streaks: Users only see their own streaks
CREATE POLICY "Users can view their own streaks"
  ON user_streaks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own streaks"
  ON user_streaks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own streaks"
  ON user_streaks FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to update course updated_at timestamp
CREATE OR REPLACE FUNCTION update_course_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_course_timestamp_trigger
BEFORE UPDATE ON courses
FOR EACH ROW
EXECUTE FUNCTION update_course_timestamp();

-- Function to update user_course_progress.last_accessed_at
CREATE OR REPLACE FUNCTION update_last_accessed()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE user_course_progress
  SET last_accessed_at = NOW()
  WHERE user_id = NEW.user_id
  AND course_id = NEW.course_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_last_accessed_trigger
AFTER INSERT ON lesson_completions
FOR EACH ROW
EXECUTE FUNCTION update_last_accessed();
