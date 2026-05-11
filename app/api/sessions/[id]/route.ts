import { loadSessionSnapshot } from '@/lib/session-data'
import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'

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

  await supabase
    .from('sessions')
    .update({ host_last_seen_at: new Date().toISOString() })
    .eq('id', id)
    .eq('teacher_id', user.id)
    .eq('status', 'active')

  const snapshot = await loadSessionSnapshot(supabase, id)
  if (!snapshot) return Response.json({ error: 'Session not found' }, { status: 404 })
  return Response.json(snapshot)
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
  const updates: Record<string, unknown> = {}

  if (body.action === 'release_host') {
    const { data, error } = await supabase
      .from('sessions')
      .update({ host_last_seen_at: null })
      .eq('id', id)
      .eq('teacher_id', user.id)
      .select()
      .single()

    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json(data)
  }

  if (body.status) updates.status = body.status
  if (body.status === 'inactive') updates.ended_at = new Date().toISOString()
  if (body.status === 'inactive') updates.host_last_seen_at = null

  if (body.status === 'inactive') {
    const { data: memberships, error: membershipError } = await supabase
      .from('group_memberships')
      .select('student_id, group_id')
      .eq('session_id', id)
      .eq('status', 'active')

    if (membershipError) {
      return Response.json({ error: membershipError.message }, { status: 500 })
    }

    const activeStudentIds = Array.from(
      new Set((memberships ?? []).map((membership) => membership.student_id))
    )
    await supabase
      .from('groups')
      .update({
        status: 'inactive',
        current_student_id: null,
        joined_at: null,
        last_active_at: null,
      })
      .eq('session_id', id)

    await supabase
      .from('group_memberships')
      .update({ status: 'session_ended' })
      .eq('session_id', id)
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
  }

  const { data, error } = await supabase
    .from('sessions')
    .update(updates)
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

  const { error } = await supabase.from('sessions').delete().eq('id', id)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return new Response(null, { status: 204 })
}
