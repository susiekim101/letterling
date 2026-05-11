import { loadSessionSnapshot } from '@/lib/session-data'
import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'

async function generateUniqueGroupCode(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = Math.floor(1000 + Math.random() * 9000)
    const { data: existing } = await supabase
      .from('groups')
      .select('id')
      .eq('group_code', code)
      .maybeSingle()

    if (!existing) return code
  }

  throw new Error('Could not generate a unique group code')
}

export async function GET(_request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('groups')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { letters_per_turn, session_id, student_ids } = body as {
    letters_per_turn?: number
    session_id?: string
    student_ids?: string[]
  }

  const selectedIds = Array.from(new Set(student_ids ?? []))

  if (!letters_per_turn || selectedIds.length === 0) {
    return Response.json(
      { error: 'letters_per_turn and at least one student_id are required' },
      { status: 400 }
    )
  }

  if (selectedIds.length > 5) {
    return Response.json({ error: 'Max 5 students per group' }, { status: 400 })
  }

  if (!session_id) {
    return Response.json({ error: 'session_id is required' }, { status: 400 })
  }

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id, status')
    .eq('id', session_id)
    .single()

  if (sessionError || !session) {
    return Response.json({ error: 'Session not found' }, { status: 404 })
  }

  if (session.status !== 'active') {
    return Response.json({ error: 'Session is not active' }, { status: 409 })
  }

  const { data: students, error: studentsError } = await supabase
    .from('students')
    .select('id, first_name, group_id')
    .in('id', selectedIds)

  if (studentsError) {
    return Response.json({ error: studentsError.message }, { status: 500 })
  }

  if ((students ?? []).length !== selectedIds.length) {
    return Response.json({ error: 'One or more students were not found' }, { status: 404 })
  }

  const { data: activeMemberships, error: membershipError } = await supabase
    .from('group_memberships')
    .select('student_id, group_id, session_id')
    .in('student_id', selectedIds)
    .eq('status', 'active')

  if (membershipError) {
    return Response.json({ error: membershipError.message }, { status: 500 })
  }

  if ((activeMemberships ?? []).length > 0) {
    return Response.json(
      {
        error: 'Some selected students are already assigned to an active group.',
        takenStudentIds: activeMemberships.map((membership) => membership.student_id),
      },
      { status: 409 }
    )
  }

  const group_code = await generateUniqueGroupCode(supabase)

  const { data: group, error: groupError } = await supabase
    .from('groups')
    .insert({
      letters_per_turn,
      num_students: selectedIds.length,
      group_code,
      teacher_id: user.id,
      session_id,
      status: 'active',
    })
    .select()
    .single()

  if (groupError || !group) {
    return Response.json({ error: groupError?.message ?? 'Failed to create group' }, { status: 500 })
  }

  const memberships = selectedIds.map((studentId, index) => ({
    group_id: group.id,
    session_id,
    student_id: studentId,
    teacher_id: user.id,
    turn_order: index + 1,
    status: 'active',
  }))

  const { error: insertMembershipError } = await supabase
    .from('group_memberships')
    .insert(memberships)

  if (insertMembershipError) {
    return Response.json({ error: insertMembershipError.message }, { status: 500 })
  }

  const { error: updateStudentsError } = await supabase
    .from('students')
    .update({ group_id: group.id })
    .in('id', selectedIds)

  if (updateStudentsError) {
    return Response.json({ error: updateStudentsError.message }, { status: 500 })
  }

  for (const student of students ?? []) {
    const { data: progress } = await supabase
      .from('student_progress')
      .select('student_id, finished_last_char')
      .eq('student_id', student.id)
      .maybeSingle()

    if (!progress) {
      const { error: insertProgressError } = await supabase.from('student_progress').insert({
        student_id: student.id,
        teacher_id: user.id,
        next_char: 0,
        goal_word: student.first_name,
        finished_last_char: false,
      })

      if (insertProgressError) {
        return Response.json({ error: insertProgressError.message }, { status: 500 })
      }

      continue
    }

    if (progress.finished_last_char) {
      const { error: resetProgressError } = await supabase
        .from('student_progress')
        .update({
          next_char: 0,
          goal_word: student.first_name,
          finished_last_char: false,
        })
        .eq('student_id', student.id)

      if (resetProgressError) {
        return Response.json({ error: resetProgressError.message }, { status: 500 })
      }
    }
  }

  const snapshot = await loadSessionSnapshot(supabase, session_id)
  return Response.json({ group, session: snapshot }, { status: 201 })
}
