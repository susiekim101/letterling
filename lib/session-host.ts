const HOST_HEARTBEAT_WINDOW_MS = 60_000

type HostedSessionRecord = {
  id: string
  teacher_id: string
  status: string
  host_last_seen_at: string | null
}

export function isTeacherHostActive(hostLastSeenAt: string | null, now = Date.now()) {
  if (!hostLastSeenAt) return false

  const lastSeen = new Date(hostLastSeenAt).getTime()
  if (Number.isNaN(lastSeen)) return false

  return now - lastSeen < HOST_HEARTBEAT_WINDOW_MS
}

export function isHostedSessionValid(session: HostedSessionRecord | null | undefined) {
  return Boolean(
    session &&
      session.status === 'active' &&
      isTeacherHostActive(session.host_last_seen_at)
  )
}

export function getHostedSessionInvalidMessage() {
  return 'This session is no longer being hosted by a teacher. Ask them to reopen it.'
}

export async function cleanupUnhostedTeacherSessions(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  teacherId: string
) {
  const { data: sessions, error: sessionError } = await supabase
    .from('sessions')
    .select('id, teacher_id, status, host_last_seen_at')
    .eq('teacher_id', teacherId)
    .eq('status', 'active')

  if (sessionError) {
    throw sessionError
  }

  const staleSessionIds = ((sessions ?? []) as HostedSessionRecord[])
    .filter((session) => !isHostedSessionValid(session))
    .map((session) => session.id)

  if (staleSessionIds.length === 0) {
    return []
  }

  const endedAt = new Date().toISOString()

  const { data: memberships, error: membershipError } = await supabase
    .from('group_memberships')
    .select('student_id')
    .in('session_id', staleSessionIds)
    .eq('status', 'active')

  if (membershipError) {
    throw membershipError
  }

  const activeStudentIds = Array.from(
    new Set((memberships ?? []).map((membership: { student_id: string }) => membership.student_id))
  )

  await supabase
    .from('groups')
    .update({
      status: 'inactive',
      current_student_id: null,
      joined_at: null,
      last_active_at: null,
    })
    .in('session_id', staleSessionIds)

  await supabase
    .from('group_memberships')
    .update({ status: 'session_ended' })
    .in('session_id', staleSessionIds)
    .eq('status', 'active')

  if (activeStudentIds.length > 0) {
    await supabase
      .from('student_progress')
      .update({
        next_char: 0,
        finished_last_char: false,
      })
      .in('student_id', activeStudentIds)
      .eq('finished_last_char', true)
  }

  await supabase
    .from('sessions')
    .update({
      status: 'inactive',
      ended_at: endedAt,
      host_last_seen_at: null,
    })
    .in('id', staleSessionIds)

  return staleSessionIds
}

export async function cleanupInvalidActiveMemberships(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  teacherId: string,
  studentIds?: string[]
) {
  let membershipQuery = supabase
    .from('group_memberships')
    .select('id, student_id, group_id, session_id')
    .eq('teacher_id', teacherId)
    .eq('status', 'active')

  if (studentIds && studentIds.length > 0) {
    membershipQuery = membershipQuery.in('student_id', studentIds)
  }

  const { data: memberships, error: membershipError } = await membershipQuery

  if (membershipError) {
    throw membershipError
  }

  const activeMemberships = (memberships ?? []) as Array<{
    id: string
    student_id: string
    group_id: string
    session_id: string
  }>

  if (activeMemberships.length === 0) {
    return []
  }

  const sessionIds = Array.from(new Set(activeMemberships.map((membership) => membership.session_id)))
  const { data: sessions, error: sessionError } = sessionIds.length
    ? await supabase
        .from('sessions')
        .select('id, teacher_id, status, host_last_seen_at')
        .in('id', sessionIds)
    : { data: [], error: null }

  if (sessionError) {
    throw sessionError
  }

  const sessionMap = new Map(
    ((sessions ?? []) as HostedSessionRecord[]).map((session) => [session.id, session])
  )

  const invalidMemberships = activeMemberships.filter((membership) => {
    const session = sessionMap.get(membership.session_id)
    return !isHostedSessionValid(session)
  })

  if (invalidMemberships.length === 0) {
    return []
  }

  const invalidMembershipIds = invalidMemberships.map((membership) => membership.id)
  const invalidStudentIds = Array.from(
    new Set(invalidMemberships.map((membership) => membership.student_id))
  )
  const invalidGroupIds = Array.from(
    new Set(invalidMemberships.map((membership) => membership.group_id))
  )

  await supabase
    .from('group_memberships')
    .update({ status: 'session_ended' })
    .in('id', invalidMembershipIds)

  if (invalidStudentIds.length > 0) {
    // student availability is now derived from group_memberships only
  }

  for (const groupId of invalidGroupIds) {
    const { count } = await supabase
      .from('group_memberships')
      .select('id', { count: 'exact', head: true })
      .eq('group_id', groupId)
      .eq('status', 'active')

    const remaining = count ?? 0
    const updates: Record<string, unknown> = {
      num_students: Math.max(1, remaining),
    }

    if (remaining === 0) {
      updates.current_student_id = null
      updates.status = 'inactive'
      updates.joined_at = null
      updates.last_active_at = null
    }

    await supabase.from('groups').update(updates).eq('id', groupId)
  }

  return invalidMembershipIds
}
