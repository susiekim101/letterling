import { invalidPlaySessionResponse, requirePlaySession } from '@/lib/play-session'
import { getHostedSessionInvalidMessage, isHostedSessionValid } from '@/lib/session-host'
import { MAX_LETTER_ATTEMPTS, getTargetLetter, type AttemptBudget } from '@/lib/student-writing'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest } from 'next/server'

type Params = { params: Promise<{ groupId: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  const { groupId } = await params
  const playSession = requirePlaySession(request, groupId)
  if (!playSession.ok) return playSession.response

  const supabase = createAdminClient()

  const { data: group, error: gErr } = await supabase
    .from('groups')
    .select(
      'id, group_code, letters_per_turn, current_student_id, status, session_id, teacher_id, joined_at, last_active_at, play_session_version'
    )
    .eq('id', groupId)
    .single()
  if (gErr) return Response.json({ error: gErr.message }, { status: 404 })
  if (group.status !== 'active' || !group.session_id) {
    return invalidPlaySessionResponse('This session is no longer active.', 400)
  }
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id, teacher_id, status, host_last_seen_at')
    .eq('id', group.session_id)
    .single()

  if (sessionError || !isHostedSessionValid(session)) {
    return invalidPlaySessionResponse(getHostedSessionInvalidMessage(), 403)
  }
  if (group.session_id !== playSession.session.sessionId) {
    return invalidPlaySessionResponse('That session has expired. Join again to continue.', 403)
  }
  if (group.play_session_version !== playSession.session.sessionVersion) {
    return invalidPlaySessionResponse('That group has been logged out. Join again to continue.', 403)
  }

  const nowIso = new Date().toISOString()
  await supabase
    .from('groups')
    .update({
      joined_at: group.joined_at ?? nowIso,
      last_active_at: nowIso,
    })
    .eq('id', groupId)

  const { data: memberships, error: membershipError } = await supabase
    .from('group_memberships')
    .select('student_id, turn_order')
    .eq('group_id', groupId)
    .eq('status', 'active')
    .order('turn_order', { ascending: true })

  if (membershipError) {
    return Response.json({ error: membershipError.message }, { status: 500 })
  }

  const studentIds = (memberships ?? []).map((membership) => membership.student_id)

  const { data: students, error: sErr } = studentIds.length
    ? await supabase
        .from('students')
        .select('id, first_name, last_name')
        .in('id', studentIds)
    : { data: [], error: null }
  if (sErr) return Response.json({ error: sErr.message }, { status: 500 })

  const orderedStudents: { id: string; first_name: string; last_name: string }[] = (
    memberships ?? []
  )
    .map((membership) => (students ?? []).find((student) => student.id === membership.student_id))
    .filter((student): student is { id: string; first_name: string; last_name: string } =>
      Boolean(student)
    )

  if (studentIds.length > 0 && group.teacher_id) {
    for (const student of orderedStudents) {
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

  let attemptBudget: AttemptBudget | null = null
  const activeStudentId = group.current_student_id
  const progressRows = progress ?? []

  if (activeStudentId && group.session_id) {
    const activeStudent = orderedStudents.find((student) => student.id === activeStudentId)
    const activeProgress = progressRows.find((item) => item.student_id === activeStudentId)

    if (activeStudent && activeProgress && !activeProgress.finished_last_char) {
      const targetLetter = getTargetLetter(
        activeProgress.goal_word,
        activeStudent.first_name,
        activeProgress.next_char
      )

      if (targetLetter) {
        const { count, error: attemptError } = await supabase
          .from('whiteboard_states')
          .select('id', { count: 'exact', head: true })
          .eq('session_id', group.session_id)
          .eq('group_id', group.id)
          .eq('student_id', activeStudent.id)
          .eq('letter_index', activeProgress.next_char)

        if (attemptError) {
          return Response.json({ error: attemptError.message }, { status: 500 })
        }

        const used = count ?? 0
        attemptBudget = {
          student_id: activeStudent.id,
          letter: targetLetter,
          letter_index: activeProgress.next_char,
          used,
          remaining: Math.max(0, MAX_LETTER_ATTEMPTS - used),
          limit: MAX_LETTER_ATTEMPTS,
        }
      }
    }
  }

  return Response.json({
    group: {
      ...group,
      joined_at: group.joined_at ?? nowIso,
      last_active_at: nowIso,
    },
    students: orderedStudents,
    progress: progressRows,
    attemptBudget,
  })
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { groupId } = await params
  const playSession = requirePlaySession(request, groupId)
  if (!playSession.ok) return playSession.response

  const body = await request.json()
  const { studentId } = body

  const supabase = createAdminClient()
  const { data: group, error: groupError } = await supabase
    .from('groups')
    .select('id, status, session_id, current_student_id, play_session_version, joined_at')
    .eq('id', groupId)
    .single()

  if (groupError || !group) {
    return Response.json({ error: 'Group not found' }, { status: 404 })
  }
  if (group.status !== 'active' || !group.session_id) {
    return invalidPlaySessionResponse('This session is no longer active.', 400)
  }
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id, teacher_id, status, host_last_seen_at')
    .eq('id', group.session_id)
    .single()

  if (sessionError || !isHostedSessionValid(session)) {
    return invalidPlaySessionResponse(getHostedSessionInvalidMessage(), 403)
  }
  if (group.session_id !== playSession.session.sessionId) {
    return invalidPlaySessionResponse('That session has expired. Join again to continue.', 403)
  }
  if (group.play_session_version !== playSession.session.sessionVersion) {
    return invalidPlaySessionResponse('That group has been logged out. Join again to continue.', 403)
  }

  if (studentId) {
    const { data: membership } = await supabase
      .from('group_memberships')
      .select('id')
      .eq('group_id', groupId)
      .eq('student_id', studentId)
      .eq('status', 'active')
      .maybeSingle()

    if (!membership) {
      return Response.json({ error: 'Student is not in this group.' }, { status: 403 })
    }

    if (group.current_student_id && group.current_student_id !== studentId) {
      return Response.json({ error: 'Another student is currently writing.' }, { status: 409 })
    }
  }

  const nowIso = new Date().toISOString()
  const { error } = await supabase
    .from('groups')
    .update({
      current_student_id: studentId ?? null,
      joined_at: group.joined_at ?? nowIso,
      last_active_at: nowIso,
    })
    .eq('id', groupId)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  if (studentId) {
    await supabase
      .from('group_memberships')
      .update({
        joined_at: nowIso,
        last_active_at: nowIso,
      })
      .eq('group_id', groupId)
      .eq('student_id', studentId)
      .eq('status', 'active')
  }

  return Response.json({ ok: true })
}
