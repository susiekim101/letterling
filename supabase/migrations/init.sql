-- Paste your SQL queries here
-- Create the teachers/profiles table
CREATE TABLE public.teachers (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT
);

-- Enable Row Level Security
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;

-- RLS Policy: SELECT
CREATE POLICY "Users can view their own profile"
  ON public.teachers
  FOR SELECT
  USING (auth.uid() = id);

-- RLS Policy: UPDATE
CREATE POLICY "Users can update their own profile"
  ON public.teachers
  FOR UPDATE
  USING (auth.uid() = id);

-- RLS Policy: DELETE
CREATE POLICY "Users can delete their own profile"
  ON public.teachers
  FOR DELETE
  USING (auth.uid() = id);

-- Trigger function: auto-insert into teachers when a new auth.users row is created
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.teachers (id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach the trigger to auth.users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
  
-- Create the students table
CREATE TABLE public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  parent_email TEXT,
  group_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

-- RLS Policy: SELECT
CREATE POLICY "Teachers can view their own students"
  ON public.students
  FOR SELECT
  USING (auth.uid() = teacher_id);

-- RLS Policy: INSERT
CREATE POLICY "Teachers can insert their own students"
  ON public.students
  FOR INSERT
  WITH CHECK (
    auth.uid() = teacher_id
    AND EXISTS (SELECT 1 FROM public.teachers WHERE id = auth.uid())
  );

-- RLS Policy: UPDATE
CREATE POLICY "Teachers can update their own students"
  ON public.students
  FOR UPDATE
  USING (auth.uid() = teacher_id)
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.teachers WHERE id = auth.uid())
  );

-- RLS Policy: DELETE
CREATE POLICY "Teachers can delete their own students"
  ON public.students
  FOR DELETE
  USING (auth.uid() = teacher_id);

-- Create the group status enum
CREATE TYPE public.group_status AS ENUM ('active', 'inactive');

-- Create the groups table
CREATE TABLE public.groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  session_id UUID, -- FK to sessions table (to be created later)
  current_student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
  status public.group_status NOT NULL DEFAULT 'inactive',
  letters_per_turn INT NOT NULL DEFAULT 1,
  group_code INT NOT NULL UNIQUE,
  num_students INT NOT NULL DEFAULT 0 CHECK (num_students BETWEEN  AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

-- RLS Policy: SELECT
CREATE POLICY "Teachers can view their own groups"
  ON public.groups
  FOR SELECT
  USING (auth.uid() = teacher_id);

-- RLS Policy: INSERT
CREATE POLICY "Teachers can insert their own groups"
  ON public.groups
  FOR INSERT
  WITH CHECK (
    auth.uid() = teacher_id
    AND EXISTS (SELECT 1 FROM public.teachers WHERE id = auth.uid())
  );

-- RLS Policy: UPDATE
CREATE POLICY "Teachers can update their own groups"
  ON public.groups
  FOR UPDATE
  USING (auth.uid() = teacher_id)
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.teachers WHERE id = auth.uid())
  );

-- RLS Policy: DELETE
CREATE POLICY "Teachers can delete their own groups"
  ON public.groups
  FOR DELETE
  USING (auth.uid() = teacher_id);

-- Backfill the group_id foreign key on students now that groups exists
ALTER TABLE public.students
  DROP COLUMN group_id;

ALTER TABLE public.students
  ADD COLUMN group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL;

-- Create the group status enum
CREATE TYPE public.group_status AS ENUM ('active', 'inactive');

-- Create the groups table
CREATE TABLE public.groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  session_id UUID, -- FK to sessions table (to be created later)
  current_student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
  status public.group_status NOT NULL DEFAULT 'inactive',
  letters_per_turn INT NOT NULL DEFAULT 1,
  group_code INT NOT NULL UNIQUE,
  num_students INT NOT NULL DEFAULT 0 CHECK (num_students BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

-- RLS Policy: SELECT
CREATE POLICY "Teachers can view their own groups"
  ON public.groups
  FOR SELECT
  USING (auth.uid() = teacher_id);

-- RLS Policy: INSERT
CREATE POLICY "Teachers can insert their own groups"
  ON public.groups
  FOR INSERT
  WITH CHECK (
    auth.uid() = teacher_id
    AND EXISTS (SELECT 1 FROM public.teachers WHERE id = auth.uid())
  );

-- RLS Policy: UPDATE
CREATE POLICY "Teachers can update their own groups"
  ON public.groups
  FOR UPDATE
  USING (auth.uid() = teacher_id)
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.teachers WHERE id = auth.uid())
  );

-- RLS Policy: DELETE
CREATE POLICY "Teachers can delete their own groups"
  ON public.groups
  FOR DELETE
  USING (auth.uid() = teacher_id);

-- Backfill the group_id foreign key on students now that groups exists
ALTER TABLE public.students
  DROP COLUMN group_id;

ALTER TABLE public.students
  ADD COLUMN group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL;
-- Create the session status enum
CREATE TYPE public.session_status AS ENUM ('active', 'inactive');

-- Create the sessions table
CREATE TABLE public.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  status public.session_status NOT NULL DEFAULT 'inactive',
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ
);

-- Enable Row Level Security
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policy: SELECT
CREATE POLICY "Teachers can view their own sessions"
  ON public.sessions
  FOR SELECT
  USING (auth.uid() = teacher_id);

-- RLS Policy: INSERT
CREATE POLICY "Teachers can insert their own sessions"
  ON public.sessions
  FOR INSERT
  WITH CHECK (
    auth.uid() = teacher_id
    AND EXISTS (SELECT 1 FROM public.teachers WHERE id = auth.uid())
  );

-- RLS Policy: UPDATE
CREATE POLICY "Teachers can update their own sessions"
  ON public.sessions
  FOR UPDATE
  USING (auth.uid() = teacher_id)
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.teachers WHERE id = auth.uid())
  );

-- RLS Policy: DELETE
CREATE POLICY "Teachers can delete their own sessions"
  ON public.sessions
  FOR DELETE
  USING (auth.uid() = teacher_id);

-- Now that sessions exists, wire up the FK on groups
ALTER TABLE public.groups
  ADD CONSTRAINT fk_groups_session
  FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE SET NULL;

-- Create the student_progress table
CREATE TABLE public.student_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  next_char INT NOT NULL DEFAULT 0,
  goal_word TEXT,
  finished_last_char BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.student_progress ENABLE ROW LEVEL SECURITY;

-- RLS Policy: SELECT
CREATE POLICY "Teachers can view their own students progress"
  ON public.student_progress
  FOR SELECT
  USING (auth.uid() = teacher_id);

-- RLS Policy: INSERT
CREATE POLICY "Teachers can insert their own students progress"
  ON public.student_progress
  FOR INSERT
  WITH CHECK (
    auth.uid() = teacher_id
    AND EXISTS (SELECT 1 FROM public.teachers WHERE id = auth.uid())
  );

-- RLS Policy: UPDATE
CREATE POLICY "Teachers can update their own students progress"
  ON public.student_progress
  FOR UPDATE
  USING (auth.uid() = teacher_id)
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.teachers WHERE id = auth.uid())
  );

-- RLS Policy: DELETE
CREATE POLICY "Teachers can delete their own students progress"
  ON public.student_progress
  FOR DELETE
  USING (auth.uid() = teacher_id);

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_student_progress_updated
  BEFORE UPDATE ON public.student_progress
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Trigger function: auto-advance finished_last_char when next_char reaches first_name length
CREATE OR REPLACE FUNCTION public.handle_next_char_advance()
RETURNS TRIGGER AS $$
DECLARE
  student_first_name TEXT;
BEGIN
  -- Fetch the student's first name
  SELECT first_name INTO student_first_name
  FROM public.students
  WHERE id = NEW.student_id;

  -- If next_char has reached the length of first_name, flip the flag
  IF NEW.next_char >= LENGTH(student_first_name) THEN
    NEW.finished_last_char = true;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_next_char_advance
  BEFORE INSERT OR UPDATE OF next_char ON public.student_progress
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_next_char_advance();

-- Create the whiteboard_states table
CREATE TABLE public.whiteboard_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  letter TEXT,
  whiteboard_data JSONB,
  gemini_feedback_text TEXT,
  gemini_whiteboard_feedback JSONB,
  is_successful BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.whiteboard_states ENABLE ROW LEVEL SECURITY;

-- RLS Policy: SELECT
CREATE POLICY "Teachers can view their own whiteboard states"
  ON public.whiteboard_states
  FOR SELECT
  USING (auth.uid() = teacher_id);

-- RLS Policy: INSERT
CREATE POLICY "Teachers can insert their own whiteboard states"
  ON public.whiteboard_states
  FOR INSERT
  WITH CHECK (
    auth.uid() = teacher_id
    AND EXISTS (SELECT 1 FROM public.teachers WHERE id = auth.uid())
  );

-- RLS Policy: UPDATE
CREATE POLICY "Teachers can update their own whiteboard states"
  ON public.whiteboard_states
  FOR UPDATE
  USING (auth.uid() = teacher_id)
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.teachers WHERE id = auth.uid())
  );

-- RLS Policy: DELETE
CREATE POLICY "Teachers can delete their own whiteboard states"
  ON public.whiteboard_states
  FOR DELETE
  USING (auth.uid() = teacher_id);