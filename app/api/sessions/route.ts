import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'

export async function GET(_request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .order('started_at', { ascending: false })

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { group_id } = body

  if (!group_id) {
    return Response.json({ error: 'group_id is required' }, { status: 400 })
  }

  // Create and immediately activate the session
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .insert({ teacher_id: user.id, status: 'active', started_at: new Date().toISOString() })
    .select()
    .single()

  if (sessionError) return Response.json({ error: sessionError.message }, { status: 500 })

  // Wire the session to the group
  const { error: groupError } = await supabase
    .from('groups')
    .update({ session_id: session.id, status: 'active' })
    .eq('id', group_id)

  if (groupError) return Response.json({ error: groupError.message }, { status: 500 })

  return Response.json(session, { status: 201 })
}
