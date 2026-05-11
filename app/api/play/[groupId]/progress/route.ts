import { invalidPlaySessionResponse, requirePlaySession } from '@/lib/play-session'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest } from 'next/server'

type Params = { params: Promise<{ groupId: string }> }

export async function PUT(request: NextRequest, { params }: Params) {
  const { groupId } = await params
  const playSession = requirePlaySession(request, groupId)
  if (!playSession.ok) return playSession.response

  const body = await request.json()
  const { studentId, next_char } = body

  if (!studentId || next_char === undefined) {
    return Response.json({ error: 'studentId and next_char are required' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data: group, error: groupError } = await supabase
    .from('groups')
    .select('id, status, session_id, current_student_id, play_session_version')
    .eq('id', groupId)
    .single()

  if (groupError || !group) {
    return Response.json({ error: 'Group not found' }, { status: 404 })
  }
  if (group.status !== 'active' || !group.session_id) {
    return invalidPlaySessionResponse('This session is no longer active.', 400)
  }
  if (group.session_id !== playSession.session.sessionId) {
    return invalidPlaySessionResponse('That session has expired. Join again to continue.', 403)
  }
  if (group.play_session_version !== playSession.session.sessionVersion) {
    return invalidPlaySessionResponse('That group has been logged out. Join again to continue.', 403)
  }
  if (group.current_student_id !== studentId) {
    return Response.json({ error: 'Only the active student can update progress.' }, { status: 403 })
  }

  const { data: membership } = await supabase
    .from('group_memberships')
    .select('id')
    .eq('student_id', studentId)
    .eq('group_id', groupId)
    .eq('status', 'active')
    .maybeSingle()

  if (!membership) {
    return Response.json({ error: 'Student is not in this group.' }, { status: 403 })
  }

  const { error } = await supabase
    .from('student_progress')
    .update({ next_char, updated_at: new Date().toISOString() })
    .eq('student_id', studentId)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  const nowIso = new Date().toISOString()
  await supabase
    .from('groups')
    .update({ last_active_at: nowIso })
    .eq('id', groupId)

  await supabase
    .from('group_memberships')
    .update({ last_active_at: nowIso })
    .eq('group_id', groupId)
    .eq('student_id', studentId)
    .eq('status', 'active')

  return Response.json({ ok: true })
}
