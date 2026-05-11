import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest } from 'next/server'

type Params = { params: Promise<{ groupId: string }> }

export async function GET(_request: NextRequest, { params }: Params) {
  const { groupId } = await params
  const supabase = createAdminClient()

  const { data: group, error: gErr } = await supabase
    .from('groups')
    .select('id, group_code, letters_per_turn, current_student_id, status, session_id, teacher_id')
    .eq('id', groupId)
    .single()
  if (gErr) return Response.json({ error: gErr.message }, { status: 404 })

  const { data: students, error: sErr } = await supabase
    .from('students')
    .select('id, first_name, last_name')
    .eq('group_id', groupId)
    .order('created_at')
  if (sErr) return Response.json({ error: sErr.message }, { status: 500 })

  const studentIds = (students ?? []).map((s) => s.id)

  // Ensure progress rows exist for all students
  if (studentIds.length > 0 && group.teacher_id) {
    for (const student of students ?? []) {
      await supabase.from('student_progress').upsert(
        {
          student_id: student.id,
          teacher_id: group.teacher_id,
          next_char: 0,
          goal_word: student.first_name,
          finished_last_char: false,
        },
        { onConflict: 'student_id', ignoreDuplicates: true }
      )
    }
  }

  const { data: progress } = studentIds.length
    ? await supabase
        .from('student_progress')
        .select('student_id, next_char, goal_word, finished_last_char')
        .in('student_id', studentIds)
    : { data: [] }

  return Response.json({ group, students: students ?? [], progress: progress ?? [] })
}

// Claim or release turn (set current_student_id)
export async function PATCH(request: NextRequest, { params }: Params) {
  const { groupId } = await params
  const body = await request.json()
  const { studentId } = body

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('groups')
    .update({ current_student_id: studentId ?? null })
    .eq('id', groupId)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
