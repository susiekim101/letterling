ALTER TABLE public.whiteboard_states
  ADD COLUMN IF NOT EXISTS letter_index INT,
  ADD COLUMN IF NOT EXISTS attempt_number INT;

CREATE INDEX IF NOT EXISTS whiteboard_states_attempt_lookup_idx
  ON public.whiteboard_states (session_id, group_id, student_id, letter_index);
