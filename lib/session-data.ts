import { cleanStudentName } from '@/lib/student-writing'

type SupabaseLike = {
  from: (table: string) => {
    select: (...args: unknown[]) => Record<string, unknown>
  }
}

export type SessionProgressRow = {
  student_id: string
  next_char: number
  goal_word: string | null
  finished_last_char: boolean
}

export type SessionMembershipRow = {
  id: string
  group_id: string
  session_id: string
  student_id: string
  turn_order: number
  status: string
  joined_at: string | null
  last_active_at: string | null
}

export type SessionStudentRow = {
  id: string
  first_name: string
  last_name: string
  parent_email: string | null
  created_at?: string
}

export type SessionGroupRow = {
  id: string
  group_code: number
  letters_per_turn: number
  current_student_id: string | null
  status: string
  session_id: string | null
  joined_at: string | null
  last_active_at: string | null
  play_session_version: number
  created_at?: string
}

export type SessionStudentView = SessionStudentRow & {
  membership: SessionMembershipRow
  student_progress: SessionProgressRow[]
}

export type SessionGroupView = SessionGroupRow & {
  students: SessionStudentView[]
  joined: boolean
  active_recently: boolean
  current_student: SessionStudentView | null
  next_student: SessionStudentView | null
}

export type SessionSnapshot = {
  id: string
  status: string
  started_at?: string | null
  ended_at?: string | null
  groups: SessionGroupView[]
}

export function pickNextStudentForGroup(
  students: SessionStudentView[],
  currentStudentId: string | null
) {
  if (students.length === 0) return null

  const ordered = [...students].sort(
    (left, right) => left.membership.turn_order - right.membership.turn_order
  )
  const startIndex = currentStudentId
    ? ordered.findIndex((student) => student.id === currentStudentId)
    : -1

  for (let offset = 1; offset <= ordered.length; offset += 1) {
    const candidate = ordered[(startIndex + offset + ordered.length) % ordered.length]
    const progress = candidate.student_progress[0]
    if (!progress?.finished_last_char) return candidate
  }

  return null
}

export function getProgressPercent(progress: SessionProgressRow | undefined, fallbackName: string) {
  if (!progress) return 0
  const total = cleanStudentName(progress.goal_word ?? fallbackName).length || 1
  return Math.min(100, Math.round((progress.next_char / total) * 100))
}

export async function loadSessionSnapshot(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  sessionId: string
): Promise<SessionSnapshot | null> {
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id, status, started_at, ended_at')
    .eq('id', sessionId)
    .single()

  if (sessionError || !session) return null

  const { data: groups, error: groupsError } = await supabase
    .from('groups')
    .select(
      'id, group_code, letters_per_turn, current_student_id, status, session_id, joined_at, last_active_at, play_session_version, created_at'
    )
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })

  if (groupsError) throw groupsError

  const { data: memberships, error: membershipError } = await supabase
    .from('group_memberships')
    .select(
      'id, group_id, session_id, student_id, turn_order, status, joined_at, last_active_at'
    )
    .eq('session_id', sessionId)
    .neq('status', 'removed')
    .order('turn_order', { ascending: true })

  if (membershipError) throw membershipError

  const studentIds = Array.from(
    new Set((memberships ?? []).map((membership: SessionMembershipRow) => membership.student_id))
  )

  const { data: students, error: studentsError } = studentIds.length
    ? await supabase
        .from('students')
        .select('id, first_name, last_name, parent_email, created_at')
        .in('id', studentIds)
    : { data: [], error: null }

  if (studentsError) throw studentsError

  const { data: progressRows, error: progressError } = studentIds.length
    ? await supabase
        .from('student_progress')
        .select('student_id, next_char, goal_word, finished_last_char')
        .in('student_id', studentIds)
    : { data: [], error: null }

  if (progressError) throw progressError

  const studentMap = new Map(
    ((students ?? []) as SessionStudentRow[]).map((student) => [student.id, student])
  )
  const progressMap = new Map(
    ((progressRows ?? []) as SessionProgressRow[]).map((progress) => [progress.student_id, progress])
  )

  const now = Date.now()
  const groupViews = ((groups ?? []) as SessionGroupRow[]).map((group) => {
    const members = ((memberships ?? []) as SessionMembershipRow[])
      .filter((membership) => membership.group_id === group.id && membership.status === 'active')
      .map((membership) => {
        const student = studentMap.get(membership.student_id)
        if (!student) return null

        return {
          ...student,
          membership,
          student_progress: progressMap.get(student.id)
            ? [progressMap.get(student.id)!]
            : [],
        }
      })
      .filter(Boolean) as SessionStudentView[]

    const currentStudent =
      members.find((student) => student.id === group.current_student_id) ?? null
    const nextStudent = pickNextStudentForGroup(members, group.current_student_id)
    const activeRecently = group.last_active_at
      ? now - new Date(group.last_active_at).getTime() < 60_000
      : false

    return {
      ...group,
      students: members,
      joined: Boolean(group.joined_at),
      active_recently: activeRecently,
      current_student: currentStudent,
      next_student: nextStudent,
    } satisfies SessionGroupView
  })

  return {
    ...session,
    groups: groupViews,
  }
}
