ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS play_session_version INT NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS public.group_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  turn_order INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed', 'session_ended')),
  joined_at TIMESTAMPTZ,
  last_active_at TIMESTAMPTZ,
  removed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.group_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can view their own group memberships"
  ON public.group_memberships FOR SELECT USING (auth.uid() = teacher_id);

CREATE POLICY "Teachers can insert their own group memberships"
  ON public.group_memberships FOR INSERT
  WITH CHECK (
    auth.uid() = teacher_id
    AND EXISTS (SELECT 1 FROM public.teachers WHERE id = auth.uid())
  );

CREATE POLICY "Teachers can update their own group memberships"
  ON public.group_memberships FOR UPDATE
  USING (auth.uid() = teacher_id)
  WITH CHECK (EXISTS (SELECT 1 FROM public.teachers WHERE id = auth.uid()));

CREATE POLICY "Teachers can delete their own group memberships"
  ON public.group_memberships FOR DELETE USING (auth.uid() = teacher_id);

CREATE INDEX IF NOT EXISTS group_memberships_session_idx
  ON public.group_memberships (session_id, group_id, student_id);

CREATE UNIQUE INDEX IF NOT EXISTS group_memberships_active_student_idx
  ON public.group_memberships (student_id)
  WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS group_memberships_active_group_student_idx
  ON public.group_memberships (group_id, student_id)
  WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS group_memberships_active_turn_order_idx
  ON public.group_memberships (group_id, turn_order)
  WHERE status = 'active';

CREATE TRIGGER on_group_memberships_updated
  BEFORE UPDATE ON public.group_memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

INSERT INTO public.group_memberships (
  session_id,
  group_id,
  student_id,
  teacher_id,
  turn_order,
  status,
  joined_at,
  last_active_at
)
SELECT
  g.session_id,
  s.group_id,
  s.id,
  s.teacher_id,
  ROW_NUMBER() OVER (PARTITION BY s.group_id ORDER BY s.created_at, s.id),
  CASE WHEN g.status = 'active' THEN 'active' ELSE 'session_ended' END,
  g.joined_at,
  g.last_active_at
FROM public.students s
JOIN public.groups g ON g.id = s.group_id
WHERE s.group_id IS NOT NULL
  AND g.session_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.group_memberships gm
    WHERE gm.group_id = s.group_id
      AND gm.student_id = s.id
      AND gm.status = CASE WHEN g.status = 'active' THEN 'active' ELSE 'session_ended' END
  );
