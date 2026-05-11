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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: group, error } = await supabase
    .from('groups')
    .select('id, session_id')
    .eq('id', id)
    .single()

  if (error || !group) return Response.json({ error: 'Group not found' }, { status: 404 })

  if (group.session_id) {
    const snapshot = await loadSessionSnapshot(supabase, group.session_id)
    const sessionGroup = snapshot?.groups.find((item) => item.id === id) ?? null
    return Response.json(sessionGroup)
  }

  return Response.json(group)
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { action, status, current_student_id, letters_per_turn, session_id, studentId } = body

  const { data: group, error: groupError } = await supabase
    .from('groups')
    .select('id, session_id, current_student_id, play_session_version, status')
    .eq('id', id)
    .single()

  if (groupError || !group) {
    return Response.json({ error: 'Group not found' }, { status: 404 })
  }

  if (action === 'logout') {
    const nextCode = await generateUniqueGroupCode(supabase)
    const { error: logoutError } = await supabase
      .from('groups')
      .update({
        current_student_id: null,
        joined_at: null,
        last_active_at: null,
        play_session_version: (group.play_session_version ?? 1) + 1,
        group_code: nextCode,
      })
      .eq('id', id)

    if (logoutError) {
      return Response.json({ error: logoutError.message }, { status: 500 })
    }

    await supabase
      .from('group_memberships')
      .update({ joined_at: null, last_active_at: null })
      .eq('group_id', id)
      .eq('status', 'active')

    return Response.json({ ok: true, group_code: nextCode })
  }

  if (action === 'remove_student') {
    if (!studentId) {
      return Response.json({ error: 'studentId is required' }, { status: 400 })
    }

    const nowIso = new Date().toISOString()
    const { error: membershipError } = await supabase
      .from('group_memberships')
      .update({
        status: 'removed',
        removed_at: nowIso,
      })
      .eq('group_id', id)
      .eq('student_id', studentId)
      .eq('status', 'active')

    if (membershipError) {
      return Response.json({ error: membershipError.message }, { status: 500 })
    }

    const { data: activeMemberships, error: remainingError } = await supabase
      .from('group_memberships')
      .select('student_id', { count: 'exact' })
      .eq('group_id', id)
      .eq('status', 'active')

    if (remainingError) {
      return Response.json({ error: remainingError.message }, { status: 500 })
    }

    const remainingCount = activeMemberships?.length ?? 0
    const updates: Record<string, unknown> = {
      num_students: remainingCount,
    }

    if (group.current_student_id === studentId) {
      updates.current_student_id = null
    }

    if (remainingCount === 0) {
      updates.status = 'inactive'
      updates.joined_at = null
      updates.last_active_at = null
    }

    const { error: updateGroupError } = await supabase
      .from('groups')
      .update(updates)
      .eq('id', id)

    if (updateGroupError) {
      return Response.json({ error: updateGroupError.message }, { status: 500 })
    }

    return Response.json({ ok: true })
  }

  const { data, error } = await supabase
    .from('groups')
    .update({ status, current_student_id, letters_per_turn, session_id })
    .eq('id', id)
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase.from('groups').delete().eq('id', id)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return new Response(null, { status: 204 })
}
