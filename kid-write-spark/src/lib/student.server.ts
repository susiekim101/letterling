import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type StudentLite = { id: string; first_name: string; last_name: string };
export type ProgressLite = {
  student_id: string;
  current_letter_index: number;
  status: string;
  turn_started_at: string | null;
};

export async function loadGroupByCode(code: string) {
  const { data: group, error } = await supabaseAdmin
    .from("groups")
    .select("id, name, code, letters_per_turn, session_id, sessions!inner(status)")
    .eq("code", code)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!group) throw new Error("No active group with that code");
  const sess = (group as unknown as { sessions: { status: string } }).sessions;
  if (sess?.status !== "active") throw new Error("Session is no longer active");
  return group;
}

export async function loadGroupState(groupId: string) {
  const { data: group, error: gErr } = await supabaseAdmin
    .from("groups")
    .select("id, name, code, letters_per_turn, session_id")
    .eq("id", groupId)
    .single();
  if (gErr) throw new Error(gErr.message);

  const { data: gs, error: gsErr } = await supabaseAdmin
    .from("group_students")
    .select("position, student:students(id, first_name, last_name)")
    .eq("group_id", groupId)
    .order("position");
  if (gsErr) throw new Error(gsErr.message);

  const { data: tp, error: tpErr } = await supabaseAdmin
    .from("turn_progress")
    .select("student_id, current_letter_index, status, turn_started_at, updated_at")
    .eq("group_id", groupId);
  if (tpErr) throw new Error(tpErr.message);

  const students: StudentLite[] = (gs ?? []).map(
    (x) => x.student as unknown as StudentLite,
  );
  const progress: ProgressLite[] = tp ?? [];

  // active = student currently writing; if any 'active' use that, else null
  const active = progress.find((p) => p.status === "active") ?? null;

  return { group, students, progress, activeStudentId: active?.student_id ?? null };
}
