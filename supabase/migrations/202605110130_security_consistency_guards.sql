DELETE FROM public.student_progress sp
USING public.students s
WHERE sp.student_id = s.id
  AND sp.teacher_id <> s.teacher_id;

WITH ranked_progress AS (
  SELECT
    sp.id,
    ROW_NUMBER() OVER (
      PARTITION BY sp.student_id
      ORDER BY sp.updated_at DESC, sp.created_at DESC, sp.id DESC
    ) AS row_number
  FROM public.student_progress sp
)
DELETE FROM public.student_progress sp
USING ranked_progress rp
WHERE sp.id = rp.id
  AND rp.row_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS student_progress_student_id_idx
  ON public.student_progress (student_id);

CREATE OR REPLACE FUNCTION public.validate_student_progress_teacher()
RETURNS TRIGGER AS $$
DECLARE
  expected_teacher_id UUID;
BEGIN
  SELECT teacher_id
  INTO expected_teacher_id
  FROM public.students
  WHERE id = NEW.student_id;

  IF expected_teacher_id IS NULL THEN
    RAISE EXCEPTION 'student_progress references a missing student';
  END IF;

  IF NEW.teacher_id <> expected_teacher_id THEN
    RAISE EXCEPTION 'student_progress.teacher_id must match the student owner';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_student_progress_teacher
  ON public.student_progress;

CREATE TRIGGER validate_student_progress_teacher
  BEFORE INSERT OR UPDATE OF student_id, teacher_id
  ON public.student_progress
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_student_progress_teacher();

CREATE OR REPLACE FUNCTION public.validate_whiteboard_state_consistency()
RETURNS TRIGGER AS $$
DECLARE
  expected_teacher_id UUID;
  expected_session_id UUID;
BEGIN
  SELECT teacher_id, session_id
  INTO expected_teacher_id, expected_session_id
  FROM public.groups
  WHERE id = NEW.group_id;

  IF expected_teacher_id IS NULL OR expected_session_id IS NULL THEN
    RAISE EXCEPTION 'whiteboard_states references a missing or detached group';
  END IF;

  IF NEW.teacher_id <> expected_teacher_id THEN
    RAISE EXCEPTION 'whiteboard_states.teacher_id must match the group owner';
  END IF;

  IF NEW.session_id <> expected_session_id THEN
    RAISE EXCEPTION 'whiteboard_states.session_id must match the group session';
  END IF;

  PERFORM 1
  FROM public.students
  WHERE id = NEW.student_id
    AND teacher_id = NEW.teacher_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'whiteboard_states.student_id must belong to the same teacher';
  END IF;

  PERFORM 1
  FROM public.group_memberships
  WHERE session_id = NEW.session_id
    AND group_id = NEW.group_id
    AND student_id = NEW.student_id
    AND teacher_id = NEW.teacher_id
    AND status <> 'removed';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'whiteboard_states must reference a valid group membership';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_whiteboard_state_consistency
  ON public.whiteboard_states;

CREATE TRIGGER validate_whiteboard_state_consistency
  BEFORE INSERT OR UPDATE OF session_id, group_id, student_id, teacher_id
  ON public.whiteboard_states
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_whiteboard_state_consistency();
