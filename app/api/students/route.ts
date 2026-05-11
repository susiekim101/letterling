import {
  cleanupInvalidActiveMemberships,
  cleanupUnhostedTeacherSessions,
  isHostedSessionValid,
} from '@/lib/session-host'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  await cleanupUnhostedTeacherSessions(admin, user.id)
  await cleanupInvalidActiveMemberships(admin, user.id)

  const groupId = request.nextUrl.searchParams.get('group_id')
  let studentIdsForGroup: string[] | null = null
  if (groupId) {
    const { data: groupMemberships, error: groupMembershipError } = await supabase
      .from('group_memberships')
      .select('student_id')
      .eq('group_id', groupId)
      .eq('status', 'active')
      .eq('teacher_id', user.id)

    if (groupMembershipError) {
      return Response.json({ error: groupMembershipError.message }, { status: 500 })
    }

    studentIdsForGroup = (groupMemberships ?? []).map((membership) => membership.student_id)
    if (studentIdsForGroup.length === 0) {
      return Response.json([])
    }
  }

  let query = supabase.from('students').select('*').order('first_name')
  if (studentIdsForGroup) {
    query = query.in('id', studentIdsForGroup)
  }

  const { data: students, error } = await query
  if (error) return Response.json({ error: error.message }, { status: 500 })

  const studentIds = (students ?? []).map((student) => student.id)
  const { data: memberships, error: membershipError } = studentIds.length
    ? await supabase
        .from('group_memberships')
        .select('student_id, group_id, session_id')
        .in('student_id', studentIds)
        .eq('status', 'active')
    : { data: [], error: null }

  if (membershipError) return Response.json({ error: membershipError.message }, { status: 500 })

  const sessionIds = Array.from(
    new Set((memberships ?? []).map((membership) => membership.session_id).filter(Boolean))
  )
  const { data: sessions, error: sessionError } = sessionIds.length
    ? await supabase
        .from('sessions')
        .select('id, teacher_id, status, host_last_seen_at')
        .in('id', sessionIds)
    : { data: [], error: null }

  if (sessionError) return Response.json({ error: sessionError.message }, { status: 500 })

  const validSessionIds = new Set(
    ((sessions ?? []) as Array<{
      id: string
      teacher_id: string
      status: string
      host_last_seen_at: string | null
    }>)
      .filter((session) => isHostedSessionValid(session))
      .map((session) => session.id)
  )

  const assignmentMap = new Map(
    (memberships ?? [])
      .filter((membership) => validSessionIds.has(membership.session_id))
      .map((membership) => [membership.student_id, membership])
  )

  return Response.json(
    (students ?? []).map((student) => ({
      ...student,
      active_assignment: assignmentMap.get(student.id) ?? null,
    }))
  )
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { first_name, last_name, parent_email } = body

  if (!first_name || !last_name) {
    return Response.json(
      { error: 'first_name and last_name are required' },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from('students')
    .insert({ first_name, last_name, parent_email, teacher_id: user.id })
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data, { status: 201 })
}
