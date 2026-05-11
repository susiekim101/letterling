import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase.from('students').select('*').eq('id', id).single()
  if (error) return Response.json({ error: error.message }, { status: 404 })
  return Response.json(data)
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { first_name, last_name, parent_email } = body

  const { data, error } = await supabase
    .from('students')
    .update({ first_name, last_name, parent_email })
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
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: activeMemberships } = await supabase
    .from('group_memberships')
    .select('group_id')
    .eq('student_id', id)
    .eq('status', 'active')

  const groupIds = Array.from(new Set((activeMemberships ?? []).map((membership) => membership.group_id)))

  const { error } = await supabase.from('students').delete().eq('id', id)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  for (const groupId of groupIds) {
    const { count } = await supabase
      .from('group_memberships')
      .select('id', { count: 'exact', head: true })
      .eq('group_id', groupId)
      .eq('status', 'active')

    const remaining = count ?? 0
    const updates: Record<string, unknown> = { num_students: remaining }

    if (remaining === 0) {
      updates.current_student_id = null
      updates.status = 'inactive'
    }

    await supabase
      .from('groups')
      .update(updates)
      .eq('id', groupId)
  }

  return new Response(null, { status: 204 })
}
